import { apiUrl } from './http'

/**
 * URLs for the media the browser fetches on our behalf.
 *
 * Everything else in this zone goes through fetch, so it can carry headers and
 * report failures. These three are handed to an img tag or an Audio element
 * instead, which means the URL itself has to carry everything, including the
 * version tag that keeps a regenerated file from being served from cache.
 */

/** Cover image for a book, tagged with the moment the cover last changed. */
export function coverUrl(book: { id: string; coverUpdatedAt?: string }): string {
  return apiUrl(`/api/books/${book.id}/cover?v=${book.coverUpdatedAt ?? ''}`)
}

/** Concatenated audiobook for a book, tagged with the moment it was generated. */
export function audiobookFileUrl(bookId: string, generatedAt?: string): string {
  const version = generatedAt ? `?v=${encodeURIComponent(generatedAt)}` : ''
  return apiUrl(`/api/books/${bookId}/audiobook/file${version}`)
}

/** Short spoken sample of a narrator voice, used when choosing one. */
export function voicePreviewUrl(voiceId: string): string {
  return apiUrl(`/api/audiobook/voices/${voiceId}/preview`)
}
