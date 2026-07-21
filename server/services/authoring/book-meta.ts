import type { BookRepository } from '../../ports/book-repository.js'
import type { Clock } from '../../ports/clock.js'
import type { BookStatus } from '@shared/domain.js'

export interface UpdateBookMetaBody {
  status?: BookStatus
  generatedUpTo?: number
  title?: string
  subtitle?: string
}

export interface UpdateBookMetaDeps {
  books: BookRepository
  clock: Clock
}

/** PATCH /api/books/:id/meta — the MCP authoring surface's direct meta patch. */
export function createUpdateBookMeta({ books, clock }: UpdateBookMetaDeps) {
  return async function updateBookMeta(bookId: string, patch: UpdateBookMetaBody): Promise<void> {
    const meta = await books.getBook(bookId)
    if (patch.status !== undefined) meta.status = patch.status
    if (patch.generatedUpTo !== undefined) meta.generatedUpTo = patch.generatedUpTo
    if (patch.title !== undefined) meta.title = patch.title
    if (patch.subtitle !== undefined) meta.subtitle = patch.subtitle
    meta.updatedAt = clock.nowIso()
    await books.saveBook(meta)
  }
}
