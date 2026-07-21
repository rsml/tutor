import type { z } from 'zod'
import { request } from './http'
import { streamGeneration } from './sse'
import type { Quiz, ChapterProgress } from '@shared/domain'
import type { GenerateChapterEvent } from '@shared/events'
import type { FeedbackBodySchema, GenerateNextBodySchema, FinalQuizBodySchema } from '@shared/contracts'

/**
 * The chapter-level endpoints. This covers one chapter's content and
 * progress, its feedback and quiz, and the three streams that write a
 * chapter while the reader watches. Book-level endpoints live in books.ts
 * instead.
 */

/** GET .../chapters/:num answers with a chapter's markdown content. */
export interface ChapterContent {
  content: string
}

/** These are the query parameters getChapterQuiz sends. quizLength is only set once the reader has chosen one. */
export interface ChapterQuizParams {
  model: string
  provider: string
  quizLength?: number
}

/** This type is the body submitChapterFeedback sends. It mirrors FeedbackBodySchema in shared/contracts.ts. */
export type ChapterFeedbackBody = z.infer<typeof FeedbackBodySchema>

/** This type is the body streamNextChapter and streamChapterRegeneration send. It mirrors GenerateNextBodySchema in shared/contracts.ts. */
export type GenerateChapterBody = z.infer<typeof GenerateNextBodySchema>

/** This type is the body generateFinalQuiz sends. It mirrors FinalQuizBodySchema in shared/contracts.ts. */
export type FinalQuizBody = z.infer<typeof FinalQuizBodySchema>

/** Fetch one chapter's markdown content. */
export function getChapter(bookId: string, num: number): Promise<ChapterContent> {
  return request<ChapterContent>(`/api/books/${bookId}/chapters/${num}`)
}

/** Record how far the reader has scrolled into a chapter, and whether they finished it. */
export function saveChapterProgress(bookId: string, num: number, progress: ChapterProgress): Promise<void> {
  return request<void>(`/api/books/${bookId}/progress/${num}`, { method: 'PUT', body: progress })
}

/** Submit what the reader liked and disliked about a chapter, plus their quiz answers. */
export function submitChapterFeedback(bookId: string, num: number, body: ChapterFeedbackBody): Promise<void> {
  return request<void>(`/api/books/${bookId}/chapters/${num}/feedback`, { method: 'POST', body })
}

/** Fetch a chapter's quiz, generating it on demand if none exists yet. */
export function getChapterQuiz(bookId: string, num: number, params: ChapterQuizParams): Promise<Quiz> {
  const query = new URLSearchParams({ model: params.model, provider: params.provider })
  if (params.quizLength) query.set('quizLength', String(params.quizLength))
  return request<Quiz>(`/api/books/${bookId}/chapters/${num}/quiz?${query}`)
}

/** Generate the whole-book quiz shown after the final chapter, or fetch the cached one. */
export function generateFinalQuiz(bookId: string, body: FinalQuizBody): Promise<Quiz> {
  return request<Quiz>(`/api/books/${bookId}/final-quiz`, { method: 'POST', body })
}

/**
 * Stream the next chapter as the server generates it.
 *
 * Takes no AbortSignal. Once called, the request runs until the server ends
 * it, whether that is success, failure, or the connection dropping. There is
 * no way for a caller to cancel it early, only to stop listening to onEvent.
 */
export function streamNextChapter(
  bookId: string,
  body: GenerateChapterBody,
  onEvent: (event: GenerateChapterEvent) => void,
): Promise<void> {
  return streamGeneration<GenerateChapterEvent>(`/api/books/${bookId}/generate-next`, { method: 'POST', body }, onEvent)
}

/**
 * Stream a chapter being regenerated in place.
 *
 * Takes no AbortSignal, the same as streamNextChapter above. Once called,
 * the request runs until the server ends it, and a caller can only stop
 * listening to onEvent, not cancel the connection itself.
 */
export function streamChapterRegeneration(
  bookId: string,
  num: number,
  body: GenerateChapterBody,
  onEvent: (event: GenerateChapterEvent) => void,
): Promise<void> {
  return streamGeneration<GenerateChapterEvent>(`/api/books/${bookId}/chapters/${num}/regenerate`, { method: 'POST', body }, onEvent)
}

/** Reconnect to a chapter generation already in progress, picking up wherever it is. */
export function streamGenerationResume(
  bookId: string,
  signal: AbortSignal,
  onEvent: (event: GenerateChapterEvent) => void,
): Promise<void> {
  // The reader aborts this signal on unmount, since it is a long-lived
  // connection that must be torn down rather than merely ignored.
  return streamGeneration<GenerateChapterEvent>(`/api/books/${bookId}/generation-stream`, { signal }, onEvent)
}
