import type { z } from 'zod'
import type { ImportEpubBodySchema, ImportEpubConfirmBodySchema } from '@shared/contracts'
import type { BookMeta } from '@shared/domain'
import type { EpubPreview } from '@shared/responses'
import { request } from './http'

/**
 * This module provides the endpoints for bringing an existing EPUB into the
 * library. A file is parsed into a preview the reader can adjust, then
 * confirmed into a finished book.
 */

type PreviewEpubImportRequest = z.infer<typeof ImportEpubBodySchema>
type ConfirmEpubImportRequest = z.infer<typeof ImportEpubConfirmBodySchema>

/** Parse an EPUB file and report its title, chapter count, and cover ahead of import. */
export function previewEpubImport(body: PreviewEpubImportRequest): Promise<EpubPreview> {
  return request<EpubPreview>('/api/books/import/preview', { method: 'POST', body })
}

/** Import a previewed EPUB into the library as a finished book. */
export function confirmEpubImport(body: ConfirmEpubImportRequest): Promise<{ book: BookMeta }> {
  return request<{ book: BookMeta }>('/api/books/import/confirm', { method: 'POST', body })
}
