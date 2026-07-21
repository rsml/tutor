import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from './book-repository.fake.js'
import { describeBookRepositoryContract } from './book-repository.contract.js'

/**
 * Proves the fake satisfies the port's behavioural contract today. A future
 * real adapter gets the same describeBookRepositoryContract call, pointed
 * at a temp directory, so the two never drift apart silently.
 */

describeBookRepositoryContract('fake', () => createFakeBookRepository())

describe('createFakeBookRepository, fake-specific behaviour', () => {
  it('is isolated per call, so two fakes never share state', async () => {
    const a = createFakeBookRepository()
    const b = createFakeBookRepository()

    await a.saveBook({
      id: 'only-in-a',
      title: 'A',
      prompt: 'p',
      status: 'reading',
      totalChapters: 1,
      generatedUpTo: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      audioGeneratedChapters: [],
    })

    expect(await a.listBooks()).toHaveLength(1)
    expect(await b.listBooks()).toEqual([])
  })

  it('protects its internal state from a caller mutating a returned book', async () => {
    const repo = createFakeBookRepository()
    const meta = {
      id: 'book-1',
      title: 'Original title',
      prompt: 'p',
      status: 'reading' as const,
      totalChapters: 1,
      generatedUpTo: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      audioGeneratedChapters: [],
    }
    await repo.saveBook(meta)

    const fetched = await repo.getBook('book-1')
    fetched.title = 'Mutated by caller'

    expect((await repo.getBook('book-1')).title).toBe('Original title')
  })

  it('protects its internal state from a caller mutating the object passed to save', async () => {
    const repo = createFakeBookRepository()
    const meta = {
      id: 'book-1',
      title: 'Original title',
      prompt: 'p',
      status: 'reading' as const,
      totalChapters: 1,
      generatedUpTo: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      audioGeneratedChapters: [],
    }
    await repo.saveBook(meta)
    meta.title = 'Mutated after save'

    expect((await repo.getBook('book-1')).title).toBe('Original title')
  })
})
