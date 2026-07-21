import type { z } from 'zod'
import type { BookMeta } from './domain.js'
import type { ImportEpubPreviewResponseSchema } from './contracts.js'

/**
 * The HTTP response bodies the server actually sends today, for the routes
 * whose shapes the client was re-declaring locally and drifting from.
 *
 * Every type here is read off the route handler that produces it, not
 * designed from scratch, so it reflects the real shape on the wire rather
 * than an idealized one. Prefer importing from here over re-declaring a
 * response shape in client/.
 *
 * Request bodies live in shared/contracts.ts. SSE event unions live in
 * shared/events.ts. This file is types only — it compiles away entirely.
 */

/** GET /api/books — one library card: book meta augmented with cover, progress, and audiobook flags. */
export type LibraryBook = BookMeta & {
  hasCover: boolean
  showTitleOnCover: boolean
  coverUpdatedAt: string | null
  chaptersRead: number
  hasAudiobook: boolean
}

/** The stage a background chapter generation is in. Mirrors GenerationStage in server/services/generation-manager.ts. */
export type GenerationStage = 'streaming' | 'saving' | 'quiz' | 'done' | 'error'

/** GET /api/books/:id/generation-status — background chapter generation progress for one book. */
export type GenerationStatus =
  | { active: false }
  | { active: true; chapterNum: number; stage: GenerationStage; contentLength: number }

/** GET /api/books/:id — book meta plus the current generation status. */
export type BookDetail = BookMeta & { generation: GenerationStatus }

/** GET /api/books/search — title, TOC, and chapter matches for a query. */
export type SearchResults = {
  results: Array<{
    bookId: string
    matches: Array<{
      type: 'title' | 'toc' | 'chapter'
      chapter?: number
      snippet: string
    }>
  }>
}

/** GET /api/progress/skills — skill mastery rolled up across every book. */
export type SkillProgress = {
  stats: {
    totalBooks: number
    completedBooks: number
    totalChapters: number
    completedChapters: number
  }
  skills: Array<{
    name: string
    totalWeight: number
    completedWeight: number
    lastActivityAt?: string
    books: Array<{
      bookId: string
      title: string
      weight: number
      completed: boolean
      lastActivityAt?: string
    }>
    subskills: Array<{ name: string; totalWeight: number; completedWeight: number }>
  }>
}

/** The kind of background job a task runs. Mirrors TaskType in server/services/task-manager.ts. */
export type TaskType =
  | 'generate-all'
  | 'generate-epub'
  | 'generate-cover'
  | 'install-audiobook'
  | 'generate-audiobook'

/** A background task's lifecycle state. Mirrors TaskStatus in server/services/task-manager.ts. */
export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled'

/** A background task's current progress. Mirrors TaskProgress in server/services/task-manager.ts. */
export type TaskProgress = {
  current: number
  total: number
  label: string
}

/** GET /api/tasks — one background task, as sent to the client. */
export type ClientTask = {
  id: string
  type: TaskType
  bookId: string
  bookTitle: string
  status: TaskStatus
  progress: TaskProgress
  error?: string
  result?: unknown
}

/**
 * POST /api/books/import/preview — parsed EPUB metadata shown before import
 * is confirmed. Same shape as ImportEpubPreviewResponseSchema in
 * shared/contracts.ts, inferred rather than restated.
 */
export type EpubPreview = z.infer<typeof ImportEpubPreviewResponseSchema>

/** An element of GET /api/audiobook/voices. */
export type VoiceInfo = {
  id: string
  name: string
  language: 'American English' | 'British English'
  gender: 'Male' | 'Female'
  grade: string
}

/** GET /api/audiobook/status — whether the narration engine is installed. */
export type AudiobookStatus = {
  installed: boolean
  missing: { model: boolean; ffmpeg: boolean }
  downloadSize: number
}
