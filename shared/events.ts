import type { ClientTask, GenerationStage, TaskProgress, TaskType } from './responses.js'

/**
 * The Server-Sent Event unions the streaming routes actually write today,
 * one per stream, discriminated on the literal `type` field.
 *
 * Each variant is read off the route's `reply.raw.write(...)` call (or, for
 * the single-chapter and tasks streams, the subscriber callback it forwards
 * verbatim) rather than designed from scratch, so it reflects what really
 * goes out on the wire. Prefer importing from here over re-declaring an SSE
 * event shape in client/.
 *
 * Response bodies for non-streaming routes live in shared/responses.ts. This
 * file is types only — it compiles away entirely.
 */

/** The error event sent verbatim by the create-book, revise-toc, start-book, and generate-chapter streams. */
export type StreamErrorEvent = { type: 'error'; message: string }

/** POST /api/books — table-of-contents generation stream. */
export type CreateBookEvent =
  | { type: 'book_created'; bookId: string; title: string; totalChapters: number }
  | { type: 'toc'; text: string }
  | { type: 'toc_done'; bookId: string; title: string; subtitle?: string; totalChapters: number }
  | { type: 'done'; bookId: string; title: string; totalChapters: number }
  | StreamErrorEvent

/** POST /api/books/:id/toc/revise — table-of-contents revision stream. */
export type ReviseTocEvent =
  | { type: 'toc'; text: string }
  | { type: 'toc_revised'; bookId: string; title: string; subtitle?: string; totalChapters: number }
  | StreamErrorEvent

/** POST /api/books/:id/start — first-chapter generation stream. */
export type StartBookEvent =
  | { type: 'skills_classified' }
  | { type: 'chapter'; text: string }
  | { type: 'done'; bookId: string }
  | StreamErrorEvent

/**
 * POST /api/books/:id/generate-next, POST /api/books/:id/chapters/:num/regenerate,
 * and GET /api/books/:id/generation-stream (reconnect) — single-chapter
 * generation stream. All three forward the same subscriber events verbatim.
 */
export type GenerateChapterEvent =
  | { type: 'chapter'; text: string; buffered?: boolean }
  | { type: 'stage'; stage: GenerationStage }
  | { type: 'done'; chapterNum: number }
  | StreamErrorEvent

/** GET /api/tasks/stream — global background-task stream. */
export type TaskEvent =
  | { type: 'task_created'; task: ClientTask }
  | { type: 'task_progress'; taskId: string; progress: TaskProgress }
  | { type: 'task_done'; taskId: string; taskType: TaskType; result?: unknown }
  | { type: 'task_error'; taskId: string; taskType: TaskType; error: string }
  | { type: 'task_cancelled'; taskId: string }
