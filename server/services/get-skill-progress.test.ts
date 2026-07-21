import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createGetSkillProgress } from './get-skill-progress.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/get-skill-progress.ts exists, against
// the BookRepository fake. Moves GET /api/progress/skills out of
// server/routes/library.ts. The aggregation math itself is BookRepository's
// contract (see book-repository.contract.ts); this test only pins that the
// service delegates to it faithfully.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn testing',
    status: 'reading',
    totalChapters: 1,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('getSkillProgress', () => {
  it('returns empty stats and no skills when nothing has been saved', async () => {
    const getSkillProgress = createGetSkillProgress({ books: createFakeBookRepository() })
    expect(await getSkillProgress()).toEqual({
      stats: { totalBooks: 0, completedBooks: 0, totalChapters: 0, completedChapters: 0 },
      skills: [],
    })
  })

  it('rolls up a completed book with a skill into the stats and skill list', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveToc('book-1', {
      skills: [{ name: 'Rust', weight: 2 }],
      chapters: [{ title: 'Ch1', description: 'd', skills: [{ skill: 'Rust', subskill: 'Ownership', weight: 1 }] }],
    })
    await books.saveChapterProgress('book-1', 1, { scroll: 1, completed: true, completedAt: '2026-01-02T00:00:00.000Z' })

    const getSkillProgress = createGetSkillProgress({ books })
    const result = await getSkillProgress()

    expect(result.stats).toEqual({ totalBooks: 1, completedBooks: 1, totalChapters: 1, completedChapters: 1 })
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].name).toBe('Rust')
    expect(result.skills[0].completedWeight).toBe(2)
  })
})
