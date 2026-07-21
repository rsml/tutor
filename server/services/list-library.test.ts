import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeArtifactStore } from '../ports/artifact-store.fake.js'
import { createListLibrary } from './list-library.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: this test is written before server/services/list-library.ts exists,
// against the BookRepository and ArtifactStore fakes, and moves the
// GET /api/books augmentation logic out of server/routes/library.ts.

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

describe('listLibrary', () => {
  it('returns an empty array when no books exist', async () => {
    const listLibrary = createListLibrary({ books: createFakeBookRepository(), artifacts: createFakeArtifactStore() })
    expect(await listLibrary()).toEqual([])
  })

  it('augments a saved book with cover, progress, and audiobook flags', async () => {
    const books = createFakeBookRepository()
    const artifacts = createFakeArtifactStore()
    await books.saveBook(makeBook())
    await artifacts.saveCover('book-1', Buffer.from('x'), 'image/png')
    await books.saveChapterProgress('book-1', 1, { scroll: 1, completed: true, completedAt: '2026-01-02T00:00:00.000Z' })

    const listLibrary = createListLibrary({ books, artifacts })
    const result = await listLibrary()

    expect(result).toHaveLength(1)
    expect(result[0].hasCover).toBe(true)
    expect(result[0].chaptersRead).toBe(1)
    expect(result[0].hasAudiobook).toBe(false)
    expect(result[0].showTitleOnCover).toBe(false)
    expect(typeof result[0].coverUpdatedAt).toBe('string')
  })

  it('defaults showTitleOnCover to true when the book meta already sets it', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ showTitleOnCover: true }))
    const listLibrary = createListLibrary({ books, artifacts: createFakeArtifactStore() })
    const [result] = await listLibrary()
    expect(result.showTitleOnCover).toBe(true)
  })

  it('returns an empty array when listBooks() itself fails', async () => {
    const books = createFakeBookRepository()
    books.listBooks = async () => { throw new Error('disk error') }
    const listLibrary = createListLibrary({ books, artifacts: createFakeArtifactStore() })
    expect(await listLibrary()).toEqual([])
  })

  it('falls back to safe defaults for a book whose augmentation throws', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const artifacts = createFakeArtifactStore()
    artifacts.hasCover = async () => { throw new Error('disk error') }

    const listLibrary = createListLibrary({ books, artifacts })
    const [result] = await listLibrary()

    expect(result.hasCover).toBe(false)
    expect(result.showTitleOnCover).toBe(false)
    expect(result.coverUpdatedAt).toBeNull()
    expect(result.chaptersRead).toBe(0)
    expect(result.hasAudiobook).toBe(false)
  })
})
