import { readFile, writeFile, mkdir, readdir, rm, lstat, rename, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  BookMetaSchema,
  TocSchema,
  ProgressSchema,
  FeedbackSchema,
  LearningProfileSchema,
  QuizSchema,
  type BookMeta,
  type Toc,
  type Progress,
  type Feedback,
  type Quiz,
  type LearningProfile,
  type ChapterProgress,
} from '../schemas.js'
import { getDataDir } from '../../lib/data-dir.js'

function booksDir(): string {
  return join(getDataDir(), 'books')
}

function bookDir(bookId: string): string {
  const base = booksDir()
  const resolved = join(base, bookId)
  if (!resolved.startsWith(base + '/') && resolved !== base) {
    throw new Error('Invalid book path')
  }
  return resolved
}

// --- YAML helpers ---

async function readYaml<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  const content = await readFile(path, 'utf-8')
  const data = parseYaml(content)
  return schema.parse(data)
}

async function writeYaml(path: string, data: unknown): Promise<void> {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  const tmp = path + '.tmp'
  await writeFile(tmp, stringifyYaml(data), 'utf-8')
  await rename(tmp, path)
}

// --- Learning Profile ---

export async function getProfile(): Promise<LearningProfile> {
  return readYaml(join(booksDir(), 'learning-profile.yml'), LearningProfileSchema)
}

export async function saveProfile(profile: LearningProfile): Promise<void> {
  LearningProfileSchema.parse(profile)
  await writeYaml(join(booksDir(), 'learning-profile.yml'), profile)
}

export async function getProfileUpdatedAt(): Promise<string | null> {
  try {
    const stats = await stat(join(booksDir(), 'learning-profile.yml'))
    return stats.mtime.toISOString()
  } catch {
    return null
  }
}

// --- Book CRUD ---

export async function listBooks(): Promise<BookMeta[]> {
  const dir = booksDir()
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
}

export async function getBook(bookId: string): Promise<BookMeta> {
  return readYaml(join(bookDir(bookId), 'meta.yml'), BookMetaSchema)
}

/**
 * Reset books stuck in transient generation states (generating_toc, generating)
 * to 'failed'. Called once at server startup — if the server restarted mid-generation,
 * the in-memory job is gone and these books will never complete on their own.
 */
export async function recoverStuckBooks(): Promise<void> {
  const books = await listBooks()
  const stuck = books.filter(b => b.status === 'generating_toc' || b.status === 'generating')
  for (const book of stuck) {
    console.warn(`[startup] Resetting stuck book "${book.id}" (${book.title}) from "${book.status}" to "failed"`)
    book.status = 'failed'
    book.updatedAt = new Date().toISOString()
    await saveBook(book)
  }
}

export async function saveBook(meta: BookMeta): Promise<void> {
  BookMetaSchema.parse(meta)
  const dir = bookDir(meta.id)
  await mkdir(dir, { recursive: true })
  await mkdir(join(dir, 'chapters'), { recursive: true })
  await mkdir(join(dir, 'feedback'), { recursive: true })
  await writeYaml(join(dir, 'meta.yml'), meta)
}

export async function deleteBook(bookId: string): Promise<void> {
  const dir = bookDir(bookId)
  if (existsSync(dir)) {
    const stat = await lstat(dir)
    if (!stat.isDirectory()) {
      throw new Error('Invalid book directory')
    }
    await rm(dir, { recursive: true })
  }
}

// --- Table of Contents ---

export async function getToc(bookId: string): Promise<Toc> {
  return readYaml(join(bookDir(bookId), 'toc.yml'), TocSchema)
}

export async function saveToc(bookId: string, toc: Toc): Promise<void> {
  TocSchema.parse(toc)
  await writeYaml(join(bookDir(bookId), 'toc.yml'), toc)
}

// --- Chapters ---

export async function getChapter(bookId: string, chapterNum: number): Promise<string> {
  const padded = String(chapterNum).padStart(2, '0')
  return readFile(join(bookDir(bookId), 'chapters', `${padded}.md`), 'utf-8')
}

export async function saveChapter(bookId: string, chapterNum: number, content: string): Promise<void> {
  const dir = join(bookDir(bookId), 'chapters')
  await mkdir(dir, { recursive: true })
  const padded = String(chapterNum).padStart(2, '0')
  const tmp = join(dir, `${padded}.md.tmp`)
  await writeFile(tmp, content, 'utf-8')
  await rename(tmp, join(dir, `${padded}.md`))
}

export async function chapterExists(bookId: string, chapterNum: number): Promise<boolean> {
  const padded = String(chapterNum).padStart(2, '0')
  return existsSync(join(bookDir(bookId), 'chapters', `${padded}.md`))
}

// --- Quiz ---

export async function getQuiz(bookId: string, chapterNum: number): Promise<Quiz> {
  const padded = String(chapterNum).padStart(2, '0')
  return readYaml(join(bookDir(bookId), 'quiz', `${padded}.yml`), QuizSchema)
}

export async function saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void> {
  QuizSchema.parse(quiz)
  const dir = join(bookDir(bookId), 'quiz')
  await mkdir(dir, { recursive: true })
  const padded = String(chapterNum).padStart(2, '0')
  await writeYaml(join(dir, `${padded}.yml`), quiz)
}

export async function quizExists(bookId: string, chapterNum: number): Promise<boolean> {
  const padded = String(chapterNum).padStart(2, '0')
  return existsSync(join(bookDir(bookId), 'quiz', `${padded}.yml`))
}

// --- Final Quiz ---

export async function getFinalQuiz(bookId: string): Promise<Quiz> {
  return readYaml(join(bookDir(bookId), 'final-quiz.yml'), QuizSchema)
}

export async function saveFinalQuiz(bookId: string, quiz: Quiz): Promise<void> {
  QuizSchema.parse(quiz)
  await writeYaml(join(bookDir(bookId), 'final-quiz.yml'), quiz)
}

export function finalQuizExists(bookId: string): boolean {
  return existsSync(join(bookDir(bookId), 'final-quiz.yml'))
}

// --- Progress ---

export async function getProgress(bookId: string): Promise<Progress> {
  const path = join(bookDir(bookId), 'progress.yml')
  if (!existsSync(path)) return { chapters: {} }
  return readYaml(path, ProgressSchema)
}

export async function saveChapterProgress(
  bookId: string,
  chapterNum: number,
  progress: ChapterProgress,
): Promise<void> {
  const current = await getProgress(bookId)
  current.chapters[String(chapterNum)] = progress
  await writeYaml(join(bookDir(bookId), 'progress.yml'), current)
}

// --- Feedback ---

export async function getFeedback(bookId: string, chapterNum: number): Promise<Feedback> {
  const padded = String(chapterNum).padStart(2, '0')
  return readYaml(join(bookDir(bookId), 'feedback', `${padded}.yml`), FeedbackSchema)
}

export async function saveFeedback(bookId: string, chapterNum: number, feedback: Feedback): Promise<void> {
  FeedbackSchema.parse(feedback)
  const padded = String(chapterNum).padStart(2, '0')
  await writeYaml(join(bookDir(bookId), 'feedback', `${padded}.yml`), feedback)
}

export interface SkillProgressResult {
  stats: { totalBooks: number; completedBooks: number; totalChapters: number; completedChapters: number }
  skills: Array<{
    name: string
    totalWeight: number
    completedWeight: number
    lastActivityAt?: string
    books: Array<{ bookId: string; title: string; weight: number; completed: boolean; lastActivityAt?: string }>
    subskills: Array<{ name: string; totalWeight: number; completedWeight: number }>
  }>
}

export async function getSkillProgress(): Promise<SkillProgressResult> {
  const allBooks = await listBooks()

  let totalBooks = 0
  let completedBooks = 0
  let totalChapters = 0
  let completedChapters = 0

  const skillMap = new Map<string, {
    name: string
    totalWeight: number
    completedWeight: number
    books: Array<{ bookId: string; title: string; weight: number; completed: boolean; lastActivityAt?: string }>
    subskills: Map<string, { name: string; totalWeight: number; completedWeight: number }>
  }>()

  for (const book of allBooks) {
    let toc: Toc
    let progress: Progress
    try {
      toc = await getToc(book.id)
      progress = await getProgress(book.id)
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
        entry = {
          name: skill.name,
          totalWeight: 0,
          completedWeight: 0,
          books: [],
          subskills: new Map(),
        }
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

  const skills = Array.from(skillMap.values()).map(s => {
    const bookDates = s.books.map(b => b.lastActivityAt).filter(Boolean) as string[]
    const lastActivityAt = bookDates.length > 0 ? bookDates.sort().pop() : undefined
    return {
      ...s,
      lastActivityAt,
      subskills: Array.from(s.subskills.values()),
    }
  })

  return {
    stats: { totalBooks, completedBooks, totalChapters, completedChapters },
    skills,
  }
}

// --- Cover ---

const COVER_EXTENSIONS = ['png', 'jpg', 'webp']

export async function getCoverPath(bookId: string): Promise<string | null> {
  const dir = bookDir(bookId)
  for (const ext of COVER_EXTENSIONS) {
    const p = join(dir, `cover.${ext}`)
    if (existsSync(p)) return p
  }
  return null
}

export async function hasCover(bookId: string): Promise<boolean> {
  return (await getCoverPath(bookId)) !== null
}

export async function getCoverMtime(bookId: string): Promise<Date | null> {
  const coverPath = await getCoverPath(bookId)
  if (!coverPath) return null
  const s = await stat(coverPath)
  return s.mtime
}

export async function saveCover(bookId: string, data: Buffer, mediaType: string): Promise<void> {
  const dir = bookDir(bookId)
  await mkdir(dir, { recursive: true })

  // Delete any existing cover first
  await deleteCover(bookId)

  const ext = mediaType === 'image/jpeg' ? 'jpg'
    : mediaType === 'image/webp' ? 'webp'
    : 'png'
  const dest = join(dir, `cover.${ext}`)
  const tmp = dest + '.tmp'
  await writeFile(tmp, data)
  await rename(tmp, dest)
}

export async function deleteCover(bookId: string): Promise<void> {
  const dir = bookDir(bookId)
  for (const ext of COVER_EXTENSIONS) {
    const p = join(dir, `cover.${ext}`)
    if (existsSync(p)) {
      await rm(p)
    }
  }
}

// --- EPUB cache ---

export function epubPath(bookId: string): string {
  return join(bookDir(bookId), 'book.epub')
}

export function epubExists(bookId: string): boolean {
  return existsSync(epubPath(bookId))
}

export async function getAllFeedback(bookId: string): Promise<Feedback[]> {
  const feedbackDir = join(bookDir(bookId), 'feedback')
  if (!existsSync(feedbackDir)) return []

  const entries = await readdir(feedbackDir)
  const feedbacks: Feedback[] = []

  for (const entry of entries.filter(e => e.endsWith('.yml')).sort()) {
    try {
      const fb = await readYaml(join(feedbackDir, entry), FeedbackSchema)
      feedbacks.push(fb)
    } catch {
      // Skip invalid feedback files
    }
  }

  return feedbacks
}
