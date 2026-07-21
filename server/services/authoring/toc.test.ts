import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createFakeClock } from '../../ports/clock.fake.js'
import { createSaveAuthoringToc } from './toc.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/authoring/toc.ts exists, against the
// BookRepository fake and a controllable fake clock. Moves
// PUT /api/books/:id/toc (the authoring write, distinct from the read-only
// GET of the same path in library.ts) out of authoring.ts.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn testing',
    status: 'generating_toc',
    totalChapters: 1,
    generatedUpTo: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('saveAuthoringToc', () => {
  it('saves the toc and updates totalChapters to match', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 1 }))
    const saveAuthoringToc = createSaveAuthoringToc({ books, clock: createFakeClock() })

    await saveAuthoringToc('book-1', [
      { title: 'A', description: 'a' },
      { title: 'B', description: 'b' },
      { title: 'C', description: 'c' },
    ])

    expect((await books.getBook('book-1')).totalChapters).toBe(3)
    expect(await books.getToc('book-1')).toEqual({
      chapters: [{ title: 'A', description: 'a' }, { title: 'B', description: 'b' }, { title: 'C', description: 'c' }],
    })
  })

  it('refreshes updatedAt from the clock', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const clock = createFakeClock()
    clock.set('2026-04-01T00:00:00.000Z')
    const saveAuthoringToc = createSaveAuthoringToc({ books, clock })

    await saveAuthoringToc('book-1', [{ title: 'A', description: 'a' }])

    expect((await books.getBook('book-1')).updatedAt).toBe('2026-04-01T00:00:00.000Z')
  })
})
