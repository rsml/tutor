import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createSearchLibrary } from './search-library.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/search-library.ts exists, against the
// BookRepository fake. Moves the GET /api/books/search matching and snippet
// logic out of server/routes/library.ts.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Learning Rust',
    prompt: 'Learn Rust',
    status: 'reading',
    totalChapters: 2,
    generatedUpTo: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('searchLibrary', () => {
  it('returns no results for an empty or whitespace-only query', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const searchLibrary = createSearchLibrary({ books })
    expect(await searchLibrary('', { full: false })).toEqual({ results: [] })
    expect(await searchLibrary('   ', { full: false })).toEqual({ results: [] })
  })

  it('matches a title case-insensitively without needing full search', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const searchLibrary = createSearchLibrary({ books })
    const { results } = await searchLibrary('RUST', { full: false })
    expect(results).toEqual([{ bookId: 'book-1', matches: [{ type: 'title', snippet: 'Learning Rust' }] }])
  })

  it('matches a subtitle', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ subtitle: 'Ownership and borrowing' }))
    const searchLibrary = createSearchLibrary({ books })
    const { results } = await searchLibrary('ownership', { full: false })
    expect(results[0].matches).toContainEqual({ type: 'title', snippet: 'Ownership and borrowing' })
  })

  it('does not search chapter TOC or content unless full is true', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveToc('book-1', { chapters: [{ title: 'Borrow checker', description: 'about borrowing' }] })
    const searchLibrary = createSearchLibrary({ books })
    expect(await searchLibrary('borrow', { full: false })).toEqual({ results: [] })
  })

  it('matches a TOC chapter title or description when full is true', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveToc('book-1', { chapters: [{ title: 'Borrow checker', description: 'about borrowing' }] })
    const searchLibrary = createSearchLibrary({ books })
    const { results } = await searchLibrary('borrow', { full: true })
    expect(results[0].matches).toContainEqual({ type: 'toc', chapter: 1, snippet: 'Borrow checker — about borrowing' })
  })

  it('returns a snippet centered on a chapter content match when full is true', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveToc('book-1', { chapters: [{ title: 'Ch1', description: 'd' }] })
    const padding = 'x'.repeat(100)
    await books.saveChapter('book-1', 1, `${padding}the quick brown fox${padding}`)
    const searchLibrary = createSearchLibrary({ books })
    const { results } = await searchLibrary('quick brown fox', { full: true })
    const chapterMatch = results[0].matches.find(m => m.type === 'chapter')
    expect(chapterMatch?.chapter).toBe(1)
    expect(chapterMatch?.snippet.startsWith('...')).toBe(true)
    expect(chapterMatch?.snippet).toContain('quick brown fox')
  })

  it('skips a book with no TOC when full is true, without throwing', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const searchLibrary = createSearchLibrary({ books })
    await expect(searchLibrary('rust', { full: true })).resolves.toEqual({
      results: [{ bookId: 'book-1', matches: [{ type: 'title', snippet: 'Learning Rust' }] }],
    })
  })

  it('omits a book from results when nothing matches', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveBook(makeBook({ id: 'book-2', title: 'Cooking Basics' }))
    const searchLibrary = createSearchLibrary({ books })
    const { results } = await searchLibrary('rust', { full: false })
    expect(results.map(r => r.bookId)).toEqual(['book-1'])
  })
})
