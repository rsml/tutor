import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { NotFoundError } from '../../ports/book-repository.js'
import { createSaveBrief, createGetBrief } from './brief.js'

// TDD: written before server/services/authoring/brief.ts exists, against the
// BookRepository fake. Moves PUT and GET /api/books/:id/brief out of
// authoring.ts.

describe('brief', () => {
  it('saves a brief so it can be read back', async () => {
    const books = createFakeBookRepository()
    const saveBrief = createSaveBrief({ books })
    const getBrief = createGetBrief({ books })

    await saveBrief('book-1', 'The brief the book was generated from.')

    await expect(getBrief('book-1')).resolves.toBe('The brief the book was generated from.')
  })

  it('propagates NotFoundError when no brief has been saved', async () => {
    const getBrief = createGetBrief({ books: createFakeBookRepository() })
    await expect(getBrief('book-1')).rejects.toThrow(NotFoundError)
  })
})
