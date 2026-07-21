import type { z } from 'zod'
import { request, apiFetch, expectOk } from './http'
import type { LibraryBook, BookDetail, SearchResults } from '@shared/responses'
import type { Toc } from '@shared/domain'
import type { PatchBookBodySchema, RatingBodySchema, GenerateNextBodySchema } from '@shared/contracts'

/**
 * The book-level endpoints. This covers the library list, one book's
 * metadata, its table of contents, and the actions that act on a whole book
 * rather than a single chapter. Chapter-level endpoints live in chapters.ts
 * instead.
 */

/** This type lists the fields updateBook may change. It mirrors PatchBookBodySchema in shared/contracts.ts. */
export type BookPatch = z.infer<typeof PatchBookBodySchema>

/** This type is the body rateBook sends. It mirrors RatingBodySchema in shared/contracts.ts. */
export type BookRating = z.infer<typeof RatingBodySchema>

/** This type is the body generateAllChapters sends. It mirrors GenerateNextBodySchema in shared/contracts.ts. */
export type GenerateAllBody = z.infer<typeof GenerateNextBodySchema>

/**
 * POST /api/books/:id/export-epub answers in one of two shapes. A cached
 * export returns the path directly. Otherwise the server has started a
 * background task, and this carries that task's id instead.
 */
export interface ExportEpubResult {
  cached?: boolean
  path?: string
  taskId?: string
}

/** List every book in the library. */
export function listBooks(): Promise<LibraryBook[]> {
  // This list is polled every second while any book is generating, so tracing
  // stays off here on purpose. The X-Trace-Id header would turn a CORS-simple
  // GET into a preflighted one, doubling the request count for as long as
  // generation runs.
  return request<LibraryBook[]>('/api/books', { trace: false })
}

/** Fetch one book's metadata plus its current generation status. */
export function getBook(id: string): Promise<BookDetail> {
  return request<BookDetail>(`/api/books/${id}`)
}

/** Change a subset of a book's metadata fields. */
export function updateBook(id: string, patch: BookPatch): Promise<void> {
  return request<void>(`/api/books/${id}`, { method: 'PATCH', body: patch })
}

/** Delete a book and everything generated for it. */
export function deleteBook(id: string): Promise<void> {
  return request<void>(`/api/books/${id}`, { method: 'DELETE' })
}

/** Clear a book's reader interaction, meaning its progress, rating, feedback, and quiz answers, without deleting its content. */
export function resetBook(id: string): Promise<void> {
  return request<void>(`/api/books/${id}/reset`, { method: 'POST' })
}

/** Rate a finished book, optionally recording its final quiz score. */
export function rateBook(id: string, rating: BookRating): Promise<void> {
  return request<void>(`/api/books/${id}/rating`, { method: 'PUT', body: rating })
}

/** Search titles, and optionally table of contents and chapter text, across the whole library. */
export function searchBooks(query: string, full: boolean): Promise<SearchResults> {
  const params = new URLSearchParams({ q: query })
  if (full) params.set('full', 'true')
  return request<SearchResults>(`/api/books/search?${params}`)
}

/** Fetch a book's approved table of contents. */
export function getToc(id: string): Promise<Toc> {
  return request<Toc>(`/api/books/${id}/toc`)
}

/** Start generating every remaining chapter as a background task. */
export function generateAllChapters(id: string, body: GenerateAllBody): Promise<{ taskId: string }> {
  return request<{ taskId: string }>(`/api/books/${id}/generate-all`, { method: 'POST', body })
}

/** Export a book to EPUB, or start the background task that exports it if no cached copy exists yet. */
export function exportEpub(id: string): Promise<ExportEpubResult> {
  return request<ExportEpubResult>(`/api/books/${id}/export-epub`, { method: 'POST', body: {} })
}

/** Download a book's already exported EPUB file as a binary blob. */
export async function downloadEpub(id: string): Promise<Blob> {
  // request<T> parses the body as JSON, which would corrupt binary data, so
  // this goes one level lower and reads the response itself.
  const response = await expectOk(await apiFetch(`/api/books/${id}/export-epub`))
  return response.blob()
}
