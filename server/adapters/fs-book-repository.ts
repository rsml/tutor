import { readFile, writeFile, mkdir, readdir, rm, lstat, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  BookMetaSchema,
  TocSchema,
  ProgressSchema,
  FeedbackSchema,
  LearningProfileSchema,
  QuizSchema,
  ChapterSummarySchema,
  ReferenceManifestSchema,
  type BookMeta,
  type Toc,
  type Progress,
  type Feedback,
  type Quiz,
  type LearningProfile,
  type ChapterProgress,
  type ChapterSummary,
  type ReferenceManifest,
} from '@shared/domain.js'
import type { SkillProgress } from '@shared/responses.js'
import { CURRENT_BOOK_SCHEMA_VERSION, CURRENT_PROFILE_SCHEMA_VERSION } from '@shared/schema-version.js'
import type { BookRepository } from '../ports/book-repository.js'
import { booksDir, bookDir, padChapter, readYaml, writeYaml } from './fs-paths.js'

/**
 * The real BookRepository adapter: YAML metadata and Markdown chapters on
 * the filesystem, rooted at {dataDir}/books/. Every method here is the same
 * logic server/services/book-store.ts used to run at module scope, moved
 * behind a factory so the data directory is a constructor argument instead
 * of a fresh getDataDir() call baked into every helper.
 *
 * "Not found" is signalled the same way the filesystem already signals it:
 * a rejected promise carrying `code: 'ENOENT'`, straight from Node's own
 * readFile/stat, with no wrapping. See the NotFoundError doc comment on the
 * port for why that is exactly what the port contract expects here.
 *
 * Implements the BookRepository port defined in server/ports/book-repository.ts.
 */

function validateReferenceName(name: string): void {
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new Error(`Invalid reference name: "${name}". Only alphanumeric characters and hyphens are allowed.`)
  }
}

function stripUserAnswers(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map(({ userAnswer: _u, correct: _c, ...rest }) => rest),
  }
}

/**
 * Removes any BookRepository-owned .tmp file left behind by an interrupted
 * atomic write for one book: chapters/NN.md.tmp, meta.yml.tmp, toc.yml.tmp,
 * progress.yml.tmp, and final-quiz.yml.tmp. Not part of the BookRepository
 * port, since no method there is about crash recovery, only ArtifactStore
 * declares recoverFromCrash(). This is exported alongside the factory so
 * server/services/recover-from-crash.ts's crash-recovery composition (see
 * its own doc comment) can sweep this adapter's own debris through this module instead
 * of reaching around it with raw fs calls of its own. Returns the paths it
 * removed.
 */
export async function cleanTmpArtifacts(dataDir: string, bookId: string): Promise<string[]> {
  const dir = bookDir(dataDir, bookId)
  const removed: string[] = []
  if (!existsSync(dir)) return removed

  const chaptersDir = join(dir, 'chapters')
  if (existsSync(chaptersDir)) {
    for (const file of await readdir(chaptersDir)) {
      if (file.endsWith('.tmp')) {
        const p = join(chaptersDir, file)
        await rm(p)
        removed.push(p)
      }
    }
  }

  for (const yamlName of ['meta.yml', 'toc.yml', 'progress.yml', 'final-quiz.yml']) {
    const yamlTmp = join(dir, `${yamlName}.tmp`)
    if (existsSync(yamlTmp)) {
      await rm(yamlTmp)
      removed.push(yamlTmp)
    }
  }

  return removed
}

/**
 * Factory for the BookRepository port. Every markdown file this port
 * writes, a chapter, the brief, or a reference's content, is not YAML, so
 * none of them goes through fs-paths.ts's writeYaml. Each still follows
 * the same tmp-then-rename sequence directly, so a crash mid-write can
 * never leave a caller reading a half-written one either.
 */
export function createFsBookRepository(opts: { dataDir: string }): BookRepository {
  const { dataDir } = opts

  const repo: BookRepository = {
    // --- Learning profile ---

    async getProfile(): Promise<LearningProfile> {
      return readYaml(join(booksDir(dataDir), 'learning-profile.yml'), LearningProfileSchema, {
        maxSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      })
    },

    async saveProfile(profile: LearningProfile): Promise<void> {
      LearningProfileSchema.parse(profile)
      // Stamping here is what makes everything the running app writes
      // current by construction, which is why the schema field can stay
      // optional and why the migrator never has to revisit a freshly
      // written file.
      await writeYaml(join(booksDir(dataDir), 'learning-profile.yml'), {
        ...profile,
        schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      })
    },

    async getProfileUpdatedAt(): Promise<string | null> {
      try {
        const stats = await stat(join(booksDir(dataDir), 'learning-profile.yml'))
        return stats.mtime.toISOString()
      } catch {
        return null
      }
    },

    // --- Book CRUD ---

    async listBooks(): Promise<BookMeta[]> {
      const dir = booksDir(dataDir)
      if (!existsSync(dir)) return []

      const entries = await readdir(dir, { withFileTypes: true })
      const books: BookMeta[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const metaPath = join(dir, entry.name, 'meta.yml')
        if (!existsSync(metaPath)) continue
        try {
          const meta = await readYaml(metaPath, BookMetaSchema)
          books.push(meta)
        } catch (err) {
          console.error(`[listBooks] Failed to load book "${entry.name}":`, err)
        }
      }

      return books.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async getBook(bookId: string): Promise<BookMeta> {
      return readYaml(join(bookDir(dataDir, bookId), 'meta.yml'), BookMetaSchema, {
        maxSchemaVersion: CURRENT_BOOK_SCHEMA_VERSION,
      })
    },

    async saveBook(meta: BookMeta): Promise<void> {
      BookMetaSchema.parse(meta)
      const dir = bookDir(dataDir, meta.id)
      await mkdir(dir, { recursive: true })
      await mkdir(join(dir, 'chapters'), { recursive: true })
      await mkdir(join(dir, 'feedback'), { recursive: true })
      // Stamping here is what makes everything the running app writes
      // current by construction, which is why the schema field can stay
      // optional and why the migrator never has to revisit a freshly
      // written file.
      await writeYaml(join(dir, 'meta.yml'), { ...meta, schemaVersion: CURRENT_BOOK_SCHEMA_VERSION })
    },

    async deleteBook(bookId: string): Promise<void> {
      const dir = bookDir(dataDir, bookId)
      if (existsSync(dir)) {
        const stats = await lstat(dir)
        if (!stats.isDirectory()) {
          throw new Error('Invalid book directory')
        }
        await rm(dir, { recursive: true })
      }
    },

    async resetBook(bookId: string): Promise<void> {
      const meta = await repo.getBook(bookId)
      if (meta.status === 'generating' || meta.status === 'generating_toc') {
        throw new Error(`Cannot reset book "${bookId}" while it is generating`)
      }

      const dir = bookDir(dataDir, bookId)

      // Delete progress.yml
      const progressPath = join(dir, 'progress.yml')
      if (existsSync(progressPath)) await rm(progressPath)

      // Delete every feedback/*.yml file (keep the directory itself; saveBook re-creates it)
      const feedbackDir = join(dir, 'feedback')
      if (existsSync(feedbackDir)) {
        for (const file of await readdir(feedbackDir)) {
          if (file.endsWith('.yml')) await rm(join(feedbackDir, file))
        }
      }

      // Strip userAnswer/correct from per-chapter quiz files (keep the questions)
      const quizDir = join(dir, 'quiz')
      if (existsSync(quizDir)) {
        for (const file of await readdir(quizDir)) {
          if (!file.endsWith('.yml')) continue
          const path = join(quizDir, file)
          const quiz = await readYaml(path, QuizSchema)
          await writeYaml(path, stripUserAnswers(quiz))
        }
      }

      // Strip userAnswer/correct from final-quiz.yml (keep the questions)
      const finalQuizPath = join(dir, 'final-quiz.yml')
      if (existsSync(finalQuizPath)) {
        const finalQuiz = await readYaml(finalQuizPath, QuizSchema)
        await writeYaml(finalQuizPath, stripUserAnswers(finalQuiz))
      }

      // Reset meta: drop rating/finalQuiz* fields, set status to 'reading', refresh updatedAt
      const { rating: _r, finalQuizScore: _s, finalQuizTotal: _t, ...rest } = meta
      await repo.saveBook({
        ...rest,
        status: 'reading',
        updatedAt: new Date().toISOString(),
      })
    },

    // --- Table of contents ---

    async getToc(bookId: string): Promise<Toc> {
      return readYaml(join(bookDir(dataDir, bookId), 'toc.yml'), TocSchema)
    },

    async saveToc(bookId: string, toc: Toc): Promise<void> {
      TocSchema.parse(toc)
      await writeYaml(join(bookDir(dataDir, bookId), 'toc.yml'), toc)
    },

    // --- Chapters ---

    async getChapter(bookId: string, chapterNum: number): Promise<string> {
      const padded = padChapter(chapterNum)
      return readFile(join(bookDir(dataDir, bookId), 'chapters', `${padded}.md`), 'utf-8')
    },

    async saveChapter(bookId: string, chapterNum: number, content: string): Promise<void> {
      const dir = join(bookDir(dataDir, bookId), 'chapters')
      await mkdir(dir, { recursive: true })
      const padded = padChapter(chapterNum)
      const tmp = join(dir, `${padded}.md.tmp`)
      await writeFile(tmp, content, 'utf-8')
      await rename(tmp, join(dir, `${padded}.md`))
    },

    async chapterExists(bookId: string, chapterNum: number): Promise<boolean> {
      const padded = padChapter(chapterNum)
      return existsSync(join(bookDir(dataDir, bookId), 'chapters', `${padded}.md`))
    },

    // --- Per chapter quiz ---

    async getQuiz(bookId: string, chapterNum: number): Promise<Quiz> {
      const padded = padChapter(chapterNum)
      return readYaml(join(bookDir(dataDir, bookId), 'quiz', `${padded}.yml`), QuizSchema)
    },

    async saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void> {
      QuizSchema.parse(quiz)
      const dir = join(bookDir(dataDir, bookId), 'quiz')
      await mkdir(dir, { recursive: true })
      const padded = padChapter(chapterNum)
      await writeYaml(join(dir, `${padded}.yml`), quiz)
    },

    async quizExists(bookId: string, chapterNum: number): Promise<boolean> {
      const padded = padChapter(chapterNum)
      return existsSync(join(bookDir(dataDir, bookId), 'quiz', `${padded}.yml`))
    },

    // --- Final quiz ---

    async getFinalQuiz(bookId: string): Promise<Quiz> {
      return readYaml(join(bookDir(dataDir, bookId), 'final-quiz.yml'), QuizSchema)
    },

    async saveFinalQuiz(bookId: string, quiz: Quiz): Promise<void> {
      QuizSchema.parse(quiz)
      await writeYaml(join(bookDir(dataDir, bookId), 'final-quiz.yml'), quiz)
    },

    finalQuizExists(bookId: string): boolean {
      return existsSync(join(bookDir(dataDir, bookId), 'final-quiz.yml'))
    },

    // --- Feedback ---

    async getFeedback(bookId: string, chapterNum: number): Promise<Feedback> {
      const padded = padChapter(chapterNum)
      return readYaml(join(bookDir(dataDir, bookId), 'feedback', `${padded}.yml`), FeedbackSchema)
    },

    async saveFeedback(bookId: string, chapterNum: number, feedback: Feedback): Promise<void> {
      FeedbackSchema.parse(feedback)
      const padded = padChapter(chapterNum)
      await writeYaml(join(bookDir(dataDir, bookId), 'feedback', `${padded}.yml`), feedback)
    },

    async getAllFeedback(bookId: string): Promise<Feedback[]> {
      const feedbackDir = join(bookDir(dataDir, bookId), 'feedback')
      if (!existsSync(feedbackDir)) return []

      const entries = await readdir(feedbackDir)
      const feedbacks: Feedback[] = []

      for (const entry of entries.filter((e) => e.endsWith('.yml')).sort()) {
        try {
          const fb = await readYaml(join(feedbackDir, entry), FeedbackSchema)
          feedbacks.push(fb)
        } catch {
          // Skip invalid feedback files
        }
      }

      return feedbacks
    },

    // --- Progress ---

    async getProgress(bookId: string): Promise<Progress> {
      const path = join(bookDir(dataDir, bookId), 'progress.yml')
      if (!existsSync(path)) return { chapters: {} }
      return readYaml(path, ProgressSchema)
    },

    async saveChapterProgress(bookId: string, chapterNum: number, progress: ChapterProgress): Promise<void> {
      const current = await repo.getProgress(bookId)
      current.chapters[String(chapterNum)] = progress
      await writeYaml(join(bookDir(dataDir, bookId), 'progress.yml'), current)
    },

    async getChaptersRead(bookId: string): Promise<number> {
      const progress = await repo.getProgress(bookId)
      return Object.values(progress.chapters).filter((ch) => ch.completed).length
    },

    async getSkillProgress(): Promise<SkillProgress> {
      const allBooks = await repo.listBooks()

      let totalBooks = 0
      let completedBooks = 0
      let totalChapters = 0
      let completedChapters = 0

      const skillMap = new Map<
        string,
        {
          name: string
          totalWeight: number
          completedWeight: number
          books: Array<{ bookId: string; title: string; weight: number; completed: boolean; lastActivityAt?: string }>
          subskills: Map<string, { name: string; totalWeight: number; completedWeight: number }>
        }
      >()

      for (const book of allBooks) {
        let toc: Toc
        let progress: Progress
        try {
          toc = await repo.getToc(book.id)
          progress = await repo.getProgress(book.id)
        } catch {
          continue
        }

        if (!toc.skills || toc.skills.length === 0) continue

        totalBooks++
        const chapCount = toc.chapters.length
        totalChapters += chapCount

        let bookCompletedChapters = 0
        let bookLastActivity: string | undefined
        for (let i = 1; i <= chapCount; i++) {
          const ch = progress.chapters[String(i)]
          if (ch?.completed) {
            bookCompletedChapters++
            if (ch.completedAt && (!bookLastActivity || ch.completedAt > bookLastActivity)) {
              bookLastActivity = ch.completedAt
            }
          }
        }
        if (!bookLastActivity) bookLastActivity = book.updatedAt
        completedChapters += bookCompletedChapters
        const bookComplete = bookCompletedChapters === chapCount

        if (bookComplete) completedBooks++

        for (const skill of toc.skills) {
          let entry = skillMap.get(skill.name)
          if (!entry) {
            entry = { name: skill.name, totalWeight: 0, completedWeight: 0, books: [], subskills: new Map() }
            skillMap.set(skill.name, entry)
          }
          entry.totalWeight += skill.weight
          if (bookComplete) entry.completedWeight += skill.weight
          entry.books.push({
            bookId: book.id,
            title: book.title,
            weight: skill.weight,
            completed: bookComplete,
            lastActivityAt: bookLastActivity,
          })
        }

        for (let i = 0; i < toc.chapters.length; i++) {
          const ch = toc.chapters[i]
          if (!ch.skills) continue
          const chapterCompleted = !!progress.chapters[String(i + 1)]?.completed

          for (const cs of ch.skills) {
            const skillEntry = skillMap.get(cs.skill)
            if (!skillEntry) continue

            let sub = skillEntry.subskills.get(cs.subskill)
            if (!sub) {
              sub = { name: cs.subskill, totalWeight: 0, completedWeight: 0 }
              skillEntry.subskills.set(cs.subskill, sub)
            }
            sub.totalWeight += cs.weight
            if (chapterCompleted) sub.completedWeight += cs.weight
          }
        }
      }

      const skills = Array.from(skillMap.values()).map((s) => {
        const bookDates = s.books.map((b) => b.lastActivityAt).filter((d): d is string => Boolean(d))
        const lastActivityAt = bookDates.length > 0 ? bookDates.sort().pop() : undefined
        return { ...s, lastActivityAt, subskills: Array.from(s.subskills.values()) }
      })

      return {
        stats: { totalBooks, completedBooks, totalChapters, completedChapters },
        skills,
      }
    },

    // --- Brief ---

    async saveBrief(bookId: string, content: string): Promise<void> {
      const dir = bookDir(dataDir, bookId)
      await mkdir(dir, { recursive: true })
      const dest = join(dir, 'brief.md')
      const tmp = dest + '.tmp'
      await writeFile(tmp, content, 'utf-8')
      await rename(tmp, dest)
    },

    async getBrief(bookId: string): Promise<string> {
      return readFile(join(bookDir(dataDir, bookId), 'brief.md'), 'utf-8')
    },

    // --- Chapter summaries ---

    async saveSummary(bookId: string, chapterNum: number, summary: ChapterSummary): Promise<void> {
      ChapterSummarySchema.parse(summary)
      const dir = join(bookDir(dataDir, bookId), 'summaries')
      await mkdir(dir, { recursive: true })
      const padded = padChapter(chapterNum)
      await writeYaml(join(dir, `${padded}.yml`), summary)
    },

    async getSummary(bookId: string, chapterNum: number): Promise<ChapterSummary> {
      const padded = padChapter(chapterNum)
      return readYaml(join(bookDir(dataDir, bookId), 'summaries', `${padded}.yml`), ChapterSummarySchema)
    },

    async getAllSummaries(bookId: string): Promise<ChapterSummary[]> {
      const summariesDir = join(bookDir(dataDir, bookId), 'summaries')
      if (!existsSync(summariesDir)) return []

      const entries = await readdir(summariesDir)
      const summaries: ChapterSummary[] = []

      for (const entry of entries.filter((e) => e.endsWith('.yml')).sort()) {
        try {
          const s = await readYaml(join(summariesDir, entry), ChapterSummarySchema)
          summaries.push(s)
        } catch {
          // Skip invalid summary files
        }
      }

      return summaries
    },

    // --- References ---

    async saveReference(bookId: string, name: string, content: string): Promise<void> {
      validateReferenceName(name)
      const dir = join(bookDir(dataDir, bookId), 'references')
      await mkdir(dir, { recursive: true })

      // Write content file atomically
      const dest = join(dir, `${name}.md`)
      const tmp = dest + '.tmp'
      await writeFile(tmp, content, 'utf-8')
      await rename(tmp, dest)

      // Update manifest: read existing, upsert entry, write back
      const manifestPath = join(dir, 'manifest.yml')
      const manifest: ReferenceManifest = existsSync(manifestPath)
        ? await readYaml(manifestPath, ReferenceManifestSchema)
        : []

      const idx = manifest.findIndex((e) => e.name === name)
      if (idx < 0) {
        manifest.push({ name })
      }

      await writeYaml(manifestPath, manifest)
    },

    async getReference(bookId: string, name: string): Promise<string> {
      validateReferenceName(name)
      return readFile(join(bookDir(dataDir, bookId), 'references', `${name}.md`), 'utf-8')
    },

    async listReferences(bookId: string): Promise<ReferenceManifest> {
      const manifestPath = join(bookDir(dataDir, bookId), 'references', 'manifest.yml')
      if (!existsSync(manifestPath)) return []
      return readYaml(manifestPath, ReferenceManifestSchema)
    },
  }

  return repo
}
