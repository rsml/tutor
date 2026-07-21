import type { BookRepository } from '../../ports/book-repository.js'
import type { ReferenceManifest } from '@shared/domain.js'

export interface ReferencesDeps {
  books: BookRepository
}

/** PUT /api/books/:id/references/:name — authoring write of one reference. */
export function createSaveReference({ books }: ReferencesDeps) {
  return async function saveReference(bookId: string, name: string, content: string): Promise<void> {
    await books.saveReference(bookId, name, content)
  }
}

/** GET /api/books/:id/references — the reference manifest. */
export function createListReferences({ books }: ReferencesDeps) {
  return async function listReferences(bookId: string): Promise<ReferenceManifest> {
    return books.listReferences(bookId)
  }
}

/** GET /api/books/:id/references/:name — one reference's content. */
export function createGetReference({ books }: ReferencesDeps) {
  return async function getReference(bookId: string, name: string): Promise<string> {
    return books.getReference(bookId, name)
  }
}
