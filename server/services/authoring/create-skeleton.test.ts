import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createFakeClock } from '../../ports/clock.fake.js'
import { createCreateSkeleton } from './create-skeleton.js'

// TDD: written before server/services/authoring/create-skeleton.ts exists,
// against the BookRepository fake and a controllable fake clock. Moves
// POST /api/books/create-skeleton out of server/routes/authoring.ts. This
// is the MCP authoring surface's entry point for creating a book directly,
// bypassing the AI TOC generation flow.

describe('createSkeleton', () => {
  it('creates a book in the generating status with no chapters generated yet', async () => {
    const books = createFakeBookRepository()
    const clock = createFakeClock()
    clock.set('2026-03-01T00:00:00.000Z')
    const createSkeleton = createCreateSkeleton({ books, clock })

    const result = await createSkeleton({ title: 'My Book', prompt: 'Teach me things', totalChapters: 10 })

    expect(result.title).toBe('My Book')
    expect(result.bookId).toHaveLength(12)

    const meta = await books.getBook(result.bookId)
    expect(meta.status).toBe('generating')
    expect(meta.totalChapters).toBe(10)
    expect(meta.generatedUpTo).toBe(0)
    expect(meta.createdAt).toBe('2026-03-01T00:00:00.000Z')
    expect(meta.updatedAt).toBe('2026-03-01T00:00:00.000Z')
    expect(meta.tags).toEqual([])
  })

  it('carries an optional subtitle through', async () => {
    const books = createFakeBookRepository()
    const createSkeleton = createCreateSkeleton({ books, clock: createFakeClock() })

    const result = await createSkeleton({ title: 'T', prompt: 'P', totalChapters: 1, subtitle: 'Sub' })

    expect((await books.getBook(result.bookId)).subtitle).toBe('Sub')
  })

  it('generates a different id for each call', async () => {
    const books = createFakeBookRepository()
    const createSkeleton = createCreateSkeleton({ books, clock: createFakeClock() })

    const a = await createSkeleton({ title: 'A', prompt: 'P', totalChapters: 1 })
    const b = await createSkeleton({ title: 'B', prompt: 'P', totalChapters: 1 })

    expect(a.bookId).not.toBe(b.bookId)
  })
})
