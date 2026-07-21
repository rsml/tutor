import { isGenerating } from '@shared/book-status.js'
import type {
  BookMeta,
  Toc,
  Progress,
  ChapterProgress,
  Feedback,
  Quiz,
  LearningProfile,
  ChapterSummary,
  ReferenceManifest,
} from '@shared/domain.js'
import type { SkillProgress } from '@shared/responses.js'
import { type BookRepository, NotFoundError } from './book-repository.js'

/**
 * An in-memory BookRepository for unit tests and for the contract test
 * itself. Every entity lives in a Map keyed by book id, mirroring how the
 * real store keys a directory per book, so deleteBook can drop every map
 * entry for that id in one pass rather than reimplementing a recursive
 * directory removal.
 *
 * Reads and writes pass every plain object and array through
 * structuredClone, so a caller mutating a returned BookMeta, or reusing
 * the object it passed to saveBook, can never reach back into the fake's
 * storage. A real filesystem adapter gets this for free because every read
 * parses a fresh object from disk, and this fake earns it the same way a
 * unit test would want it, on purpose rather than by accident.
 *
 * Timestamps this fake generates itself, meaning resetBook's updatedAt and
 * the learning profile's updatedAt, come from an internal counter rather
 * than the real clock, so two calls in the same test never produce the
 * same instant and a run is reproducible no matter how fast it executes.
 * The counter starts from a fixed date past any date a test is likely to
 * write into a fixture by hand, so a generated timestamp reliably compares
 * later than one a test supplied, without this fake ever reading the real
 * clock.
 */

const FAKE_EPOCH_MS = Date.UTC(2100, 0, 1)

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

export function createFakeBookRepository(): BookRepository {
  const books = new Map<string, BookMeta>()
  const tocs = new Map<string, Toc>()
  const chapters = new Map<string, Map<number, string>>()
  const quizzes = new Map<string, Map<number, Quiz>>()
  const finalQuizzes = new Map<string, Quiz>()
  const feedback = new Map<string, Map<number, Feedback>>()
  const progress = new Map<string, Progress>()
  const briefs = new Map<string, string>()
  const summaries = new Map<string, Map<number, ChapterSummary>>()
  const references = new Map<string, Map<string, string>>()
  const referenceManifests = new Map<string, ReferenceManifest>()
  let profile: LearningProfile | undefined
  let profileUpdatedAt: string | null = null

  let tick = 0
  const nextTimestamp = (): string => new Date(FAKE_EPOCH_MS + ++tick * 1000).toISOString()

  function subMapFor<K, T>(store: Map<string, Map<K, T>>, bookId: string): Map<K, T> {
    let byKey = store.get(bookId)
    if (!byKey) {
      byKey = new Map()
      store.set(bookId, byKey)
    }
    return byKey
  }

  return {
    // --- Learning profile ---

    async getProfile(): Promise<LearningProfile> {
      if (!profile) throw new NotFoundError('Learning profile has not been saved yet')
      return structuredClone(profile)
    },

    async saveProfile(newProfile: LearningProfile): Promise<void> {
      profile = structuredClone(newProfile)
      profileUpdatedAt = nextTimestamp()
    },

    async getProfileUpdatedAt(): Promise<string | null> {
      return profileUpdatedAt
    },

    // --- Book CRUD ---

    async listBooks(): Promise<BookMeta[]> {
      return [...books.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((meta) => structuredClone(meta))
    },

    async getBook(bookId: string): Promise<BookMeta> {
      const meta = books.get(bookId)
      if (!meta) throw new NotFoundError(`Book "${bookId}" not found`)
      return structuredClone(meta)
    },

    async saveBook(meta: BookMeta): Promise<void> {
      books.set(meta.id, structuredClone(meta))
    },

    async deleteBook(bookId: string): Promise<void> {
      books.delete(bookId)
      tocs.delete(bookId)
      chapters.delete(bookId)
      quizzes.delete(bookId)
      finalQuizzes.delete(bookId)
      feedback.delete(bookId)
      progress.delete(bookId)
      briefs.delete(bookId)
      summaries.delete(bookId)
      references.delete(bookId)
      referenceManifests.delete(bookId)
    },

    async resetBook(bookId: string): Promise<void> {
      const meta = books.get(bookId)
      if (!meta) throw new NotFoundError(`Book "${bookId}" not found`)
      if (isGenerating(meta.status)) {
        throw new Error(`Cannot reset book "${bookId}" while it is generating`)
      }

      progress.delete(bookId)
      feedback.delete(bookId)

      const quizzesForBook = quizzes.get(bookId)
      if (quizzesForBook) {
        for (const [num, quiz] of quizzesForBook) {
          quizzesForBook.set(num, stripUserAnswers(quiz))
        }
      }

      const finalQuiz = finalQuizzes.get(bookId)
      if (finalQuiz) finalQuizzes.set(bookId, stripUserAnswers(finalQuiz))

      const { rating: _r, finalQuizScore: _s, finalQuizTotal: _t, ...rest } = meta
      books.set(bookId, { ...rest, status: 'reading', updatedAt: nextTimestamp() })
    },

    // --- Table of contents ---

    async getToc(bookId: string): Promise<Toc> {
      const toc = tocs.get(bookId)
      if (!toc) throw new NotFoundError(`Table of contents for book "${bookId}" not found`)
      return structuredClone(toc)
    },

    async saveToc(bookId: string, toc: Toc): Promise<void> {
      tocs.set(bookId, structuredClone(toc))
    },

    // --- Chapters ---

    async getChapter(bookId: string, chapterNum: number): Promise<string> {
      const content = chapters.get(bookId)?.get(chapterNum)
      if (content === undefined) throw new NotFoundError(`Chapter ${chapterNum} of book "${bookId}" not found`)
      return content
    },

    async saveChapter(bookId: string, chapterNum: number, content: string): Promise<void> {
      subMapFor(chapters, bookId).set(chapterNum, content)
    },

    async chapterExists(bookId: string, chapterNum: number): Promise<boolean> {
      return chapters.get(bookId)?.has(chapterNum) ?? false
    },

    // --- Per chapter quiz ---

    async getQuiz(bookId: string, chapterNum: number): Promise<Quiz> {
      const quiz = quizzes.get(bookId)?.get(chapterNum)
      if (!quiz) throw new NotFoundError(`Quiz for chapter ${chapterNum} of book "${bookId}" not found`)
      return structuredClone(quiz)
    },

    async saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void> {
      subMapFor(quizzes, bookId).set(chapterNum, structuredClone(quiz))
    },

    async quizExists(bookId: string, chapterNum: number): Promise<boolean> {
      return quizzes.get(bookId)?.has(chapterNum) ?? false
    },

    // --- Final quiz ---

    async getFinalQuiz(bookId: string): Promise<Quiz> {
      const quiz = finalQuizzes.get(bookId)
      if (!quiz) throw new NotFoundError(`Final quiz for book "${bookId}" not found`)
      return structuredClone(quiz)
    },

    async saveFinalQuiz(bookId: string, quiz: Quiz): Promise<void> {
      finalQuizzes.set(bookId, structuredClone(quiz))
    },

    finalQuizExists(bookId: string): boolean {
      return finalQuizzes.has(bookId)
    },

    // --- Feedback ---

    async getFeedback(bookId: string, chapterNum: number): Promise<Feedback> {
      const fb = feedback.get(bookId)?.get(chapterNum)
      if (!fb) throw new NotFoundError(`Feedback for chapter ${chapterNum} of book "${bookId}" not found`)
      return structuredClone(fb)
    },

    async saveFeedback(bookId: string, chapterNum: number, fb: Feedback): Promise<void> {
      subMapFor(feedback, bookId).set(chapterNum, structuredClone(fb))
    },

    async getAllFeedback(bookId: string): Promise<Feedback[]> {
      const byNum = feedback.get(bookId)
      if (!byNum) return []
      return [...byNum.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, fb]) => structuredClone(fb))
    },

    // --- Progress ---

    async getProgress(bookId: string): Promise<Progress> {
      const current = progress.get(bookId)
      return current ? structuredClone(current) : { chapters: {} }
    },

    async saveChapterProgress(bookId: string, chapterNum: number, chapterProgress: ChapterProgress): Promise<void> {
      const current = progress.get(bookId) ?? { chapters: {} }
      current.chapters[String(chapterNum)] = structuredClone(chapterProgress)
      progress.set(bookId, current)
    },

    async getChaptersRead(bookId: string): Promise<number> {
      const current = progress.get(bookId) ?? { chapters: {} }
      return Object.values(current.chapters).filter((ch) => ch.completed).length
    },

    async getSkillProgress(): Promise<SkillProgress> {
      const allBooks = [...books.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

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
        const toc = tocs.get(book.id)
        if (!toc) continue
        if (!toc.skills || toc.skills.length === 0) continue
        const bookProgress = progress.get(book.id) ?? { chapters: {} }

        totalBooks++
        const chapCount = toc.chapters.length
        totalChapters += chapCount

        let bookCompletedChapters = 0
        let bookLastActivity: string | undefined
        for (let i = 1; i <= chapCount; i++) {
          const ch = bookProgress.chapters[String(i)]
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
          const chapterCompleted = !!bookProgress.chapters[String(i + 1)]?.completed

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
      briefs.set(bookId, content)
    },

    async getBrief(bookId: string): Promise<string> {
      const brief = briefs.get(bookId)
      if (brief === undefined) throw new NotFoundError(`Brief for book "${bookId}" not found`)
      return brief
    },

    // --- Chapter summaries ---

    async saveSummary(bookId: string, chapterNum: number, summary: ChapterSummary): Promise<void> {
      subMapFor(summaries, bookId).set(chapterNum, structuredClone(summary))
    },

    async getSummary(bookId: string, chapterNum: number): Promise<ChapterSummary> {
      const summary = summaries.get(bookId)?.get(chapterNum)
      if (!summary) throw new NotFoundError(`Summary for chapter ${chapterNum} of book "${bookId}" not found`)
      return structuredClone(summary)
    },

    async getAllSummaries(bookId: string): Promise<ChapterSummary[]> {
      const byNum = summaries.get(bookId)
      if (!byNum) return []
      return [...byNum.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, summary]) => structuredClone(summary))
    },

    // --- References ---

    async saveReference(bookId: string, name: string, content: string): Promise<void> {
      validateReferenceName(name)
      subMapFor(references, bookId).set(name, content)

      const manifest = referenceManifests.get(bookId) ?? []
      const idx = manifest.findIndex((e) => e.name === name)
      const nextManifest = [...manifest]
      if (idx >= 0) {
        nextManifest[idx] = { ...nextManifest[idx], name }
      } else {
        nextManifest.push({ name })
      }
      referenceManifests.set(bookId, nextManifest)
    },

    async getReference(bookId: string, name: string): Promise<string> {
      validateReferenceName(name)
      const content = references.get(bookId)?.get(name)
      if (content === undefined) throw new NotFoundError(`Reference "${name}" of book "${bookId}" not found`)
      return content
    },

    async listReferences(bookId: string): Promise<ReferenceManifest> {
      const manifest = referenceManifests.get(bookId)
      return manifest ? structuredClone(manifest) : []
    },
  }
}
