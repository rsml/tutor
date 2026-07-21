import type { z } from 'zod'
import type {
  CreateBookBodySchema,
  ReviseTocBodySchema,
  StartBookBodySchema,
  SuggestBookBodySchema,
  SuggestDetailsBodySchema,
} from '@shared/contracts'
import type { CreateBookEvent, ReviseTocEvent, StartBookEvent } from '@shared/events'
import { request } from './http'
import { streamGeneration } from './sse'

/**
 * This module provides the client side of the creation wizard. It covers
 * topic and detail suggestions, table of contents generation and revision,
 * and the first chapter that follows approval.
 */

type CreateBookRequest = z.infer<typeof CreateBookBodySchema>
type StartFirstChapterRequest = z.infer<typeof StartBookBodySchema>
type ReviseTocRequest = z.infer<typeof ReviseTocBodySchema>
type SuggestTopicRequest = z.infer<typeof SuggestBookBodySchema>
type SuggestDetailsRequest = z.infer<typeof SuggestDetailsBodySchema>

/** The topic and reasoning the AI suggests before a book is created. */
export interface SuggestTopicResponse {
  topic: string
  reasoning?: string
}

/** The elaborated focus and context the AI suggests for a chosen topic. */
export interface SuggestDetailsResponse {
  details: string
}

/** The fields needed to create a bare book record ahead of agentic generation. */
export interface CreateSkeletonRequest {
  title: string
  prompt: string
  totalChapters: number
}

/** The identity of the bare book record an agentic caller will generate into. */
export interface CreateSkeletonResponse {
  bookId: string
  title: string
}

/** Start table of contents generation for a new book and stream each event to the callback as it arrives. */
export function createBookStream(
  body: CreateBookRequest,
  onEvent: (event: CreateBookEvent) => void,
): Promise<void> {
  return streamGeneration<CreateBookEvent>('/api/books', { method: 'POST', body }, onEvent)
}

/** Generate the first chapter of an approved book and stream each event to the callback as it arrives. */
export function startFirstChapterStream(
  bookId: string,
  body: StartFirstChapterRequest,
  onEvent: (event: StartBookEvent) => void,
): Promise<void> {
  return streamGeneration<StartBookEvent>(`/api/books/${bookId}/start`, { method: 'POST', body }, onEvent)
}

/** Revise a book's table of contents from reader feedback and stream each event to the callback as it arrives. */
export function reviseTocStream(
  bookId: string,
  body: ReviseTocRequest,
  onEvent: (event: ReviseTocEvent) => void,
): Promise<void> {
  return streamGeneration<ReviseTocEvent>(`/api/books/${bookId}/toc/revise`, { method: 'POST', body }, onEvent)
}

/** Ask the AI to suggest a book topic from the reader's profile and quiz history. */
export function suggestTopic(body: SuggestTopicRequest): Promise<SuggestTopicResponse> {
  return request<SuggestTopicResponse>('/api/books/suggest', { method: 'POST', body })
}

/** Ask the AI to elaborate a chosen topic into a few sentences of focus and context. */
export function suggestDetails(body: SuggestDetailsRequest): Promise<SuggestDetailsResponse> {
  return request<SuggestDetailsResponse>('/api/books/suggest-details', { method: 'POST', body })
}

/** Create a bare book record with no chapters yet, for a caller that will generate the content itself. */
export function createSkeleton(body: CreateSkeletonRequest): Promise<CreateSkeletonResponse> {
  return request<CreateSkeletonResponse>('/api/books/create-skeleton', { method: 'POST', body })
}
