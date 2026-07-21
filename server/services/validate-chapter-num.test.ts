import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { validateChapterNum } from './validate-chapter-num.js'

// Mirrors domain/chapter-range.ts's validateChapterNum exactly (message text
// and statusCode), but takes a BookRepository as an argument instead of
// reaching for the book-store.js shim, so callers built on this stay unit
// testable against createFakeBookRepository() with no real filesystem I/O.

describe('validateChapterNum', () => {
  it('resolves when the chapter number is within the book\'s range', async () => {
    const books = createFakeBookRepository()
    await books.saveBook({
      id: 'book-1', title: 'T', prompt: 'P', status: 'reading',
      totalChapters: 5, generatedUpTo: 2, createdAt: '', updatedAt: '',
      tags: [], audioGeneratedChapters: [],
    })

    await expect(validateChapterNum(books, 'book-1', 1)).resolves.toBeUndefined()
    await expect(validateChapterNum(books, 'book-1', 5)).resolves.toBeUndefined()
  })

  it('rejects with a 400 statusCode and a message naming the valid range when the chapter is too high', async () => {
    const books = createFakeBookRepository()
    await books.saveBook({
      id: 'book-1', title: 'T', prompt: 'P', status: 'reading',
      totalChapters: 3, generatedUpTo: 1, createdAt: '', updatedAt: '',
      tags: [], audioGeneratedChapters: [],
    })

    await expect(validateChapterNum(books, 'book-1', 5)).rejects.toMatchObject({
      message: 'Chapter 5 out of range (1-3)',
      statusCode: 400,
    })
  })

  it('rejects chapter 0 the same way', async () => {
    const books = createFakeBookRepository()
    await books.saveBook({
      id: 'book-1', title: 'T', prompt: 'P', status: 'reading',
      totalChapters: 3, generatedUpTo: 1, createdAt: '', updatedAt: '',
      tags: [], audioGeneratedChapters: [],
    })

    await expect(validateChapterNum(books, 'book-1', 0)).rejects.toMatchObject({
      message: 'Chapter 0 out of range (1-3)',
      statusCode: 400,
    })
  })

  it('propagates the repository\'s NotFoundError for an unknown book', async () => {
    const books = createFakeBookRepository()
    await expect(validateChapterNum(books, 'does-not-exist', 1)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
