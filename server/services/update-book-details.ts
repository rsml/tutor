import type { z } from 'zod'
import type { BookRepository } from '../ports/book-repository.js'
import type { Clock } from '../ports/clock.js'
import type { PatchBookBodySchema } from '@shared/contracts.js'

export type PatchBookBody = z.infer<typeof PatchBookBodySchema>

export interface UpdateBookDetailsDeps {
  books: BookRepository
  clock: Clock
}

/**
 * PATCH /api/books/:id — merges only the fields the patch supplies.
 *
 * series, seriesOrder, and sortOrder go through an untyped assignment on
 * purpose: PatchBookBodySchema allows null on these three to mean "remove
 * it", but BookMeta types them as optional rather than nullable, so a plain
 * assignment would not typecheck. tags and showTitleOnCover need no such
 * escape hatch, since BookMeta already types them to match the patch.
 */
export function createUpdateBookDetails({ books, clock }: UpdateBookDetailsDeps) {
  return async function updateBookDetails(bookId: string, patch: PatchBookBody): Promise<void> {
    const meta = await books.getBook(bookId)
    if (patch.title !== undefined) meta.title = patch.title
    if (patch.subtitle !== undefined) meta.subtitle = patch.subtitle
    if (patch.showTitleOnCover !== undefined) meta.showTitleOnCover = patch.showTitleOnCover
    if (patch.tags !== undefined) {
      meta.tags = patch.tags.map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
    }
    if (patch.series !== undefined) (meta as Record<string, unknown>).series = patch.series
    if (patch.seriesOrder !== undefined) (meta as Record<string, unknown>).seriesOrder = patch.seriesOrder
    if (patch.sortOrder !== undefined) (meta as Record<string, unknown>).sortOrder = patch.sortOrder
    meta.updatedAt = clock.nowIso()
    await books.saveBook(meta)
  }
}
