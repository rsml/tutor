import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { NotFoundError } from '../ports/book-repository.js'
import { createDeleteBook } from './delete-book.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/delete-book.ts exists, against the
// BookRepository and ArtifactStore fakes. Moves DELETE /api/books/:id out of
// server/routes/library.ts, and makes the artifact cleanup explicit rather
// than relying on the real adapter's directory-level rm -rf as the only
// thing that happens to clean up covers and audiobook files today.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn testing',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('deleteBook', () => {
  it('removes the book itself', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const deleteBook = createDeleteBook({ books, artifacts: createFakeArtifactStore() })

    await deleteBook('book-1')

    await expect(books.getBook('book-1')).rejects.toThrow(NotFoundError)
  })

  it('removes the cover and audiobook artifacts along with the book', async () => {
    const books = createFakeBookRepository()
    const artifacts = createFakeArtifactStore()
    await books.saveBook(makeBook())
    await artifacts.saveCover('book-1', Buffer.from('x'), 'image/png')
    await artifacts.saveAudiobookManifest('book-1', {
      version: 1,
      voice: 'onyx',
      speed: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      m4bPath: '/fake/book.m4b',
      chapters: [],
    })

    const deleteBook = createDeleteBook({ books, artifacts })
    await deleteBook('book-1')

    expect(await artifacts.hasCover('book-1')).toBe(false)
    expect(await artifacts.getAudiobookManifest('book-1')).toBeNull()
  })

  it('resolves without error for a book that was never saved', async () => {
    const deleteBook = createDeleteBook({ books: createFakeBookRepository(), artifacts: createFakeArtifactStore() })
    await expect(deleteBook('never-existed')).resolves.toBeUndefined()
  })
})
