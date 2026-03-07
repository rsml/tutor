import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  BookMetaSchema,
  TocSchema,
  ProgressSchema,
  FeedbackSchema,
  LearningProfileSchema,
  type BookMeta,
  type Toc,
  type Progress,
  type Feedback,
  type LearningProfile,
  type ChapterProgress,
} from '../schemas.js'

function booksDir(): string {
  return join(process.cwd(), 'books')
}

function bookDir(bookId: string): string {
  return join(booksDir(), bookId)
}

// --- YAML helpers ---

async function readYaml<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  const content = await readFile(path, 'utf-8')
  const data = parseYaml(content)
  return schema.parse(data)
}

async function writeYaml(path: string, data: unknown): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf('/'))
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(path, stringifyYaml(data), 'utf-8')
}

// --- Learning Profile ---

export async function getProfile(): Promise<LearningProfile> {
  return readYaml(join(booksDir(), 'learning-profile.yml'), LearningProfileSchema)
}

export async function saveProfile(profile: LearningProfile): Promise<void> {
  LearningProfileSchema.parse(profile)
  await writeYaml(join(booksDir(), 'learning-profile.yml'), profile)
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
    } catch {
      // Skip invalid books
    }
  }

  return books.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getBook(bookId: string): Promise<BookMeta> {
  return readYaml(join(bookDir(bookId), 'meta.yml'), BookMetaSchema)
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
  await writeFile(join(dir, `${padded}.md`), content, 'utf-8')
}

export async function chapterExists(bookId: string, chapterNum: number): Promise<boolean> {
  const padded = String(chapterNum).padStart(2, '0')
  return existsSync(join(bookDir(bookId), 'chapters', `${padded}.md`))
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
