import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import { getSkillProgress } from './progress'

/** The progress endpoint rolls up skill mastery across every book into one document, so there is exactly one call to pin here. */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
})

describe('getSkillProgress', () => {
  it('requests the rolled up skill progress', async () => {
    const payload = {
      stats: { totalBooks: 2, completedBooks: 1, totalChapters: 10, completedChapters: 6 },
      skills: [
        {
          name: 'TypeScript',
          totalWeight: 10,
          completedWeight: 6,
          books: [{ bookId: 'ada', title: 'Ada', weight: 10, completed: false }],
          subskills: [],
        },
      ],
    }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    const result = await getSkillProgress()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/progress/skills')
    expect((init as RequestInit).method).toBeUndefined()
    expect(result).toEqual(payload)
  })

  it('throws an ApiError carrying the status and the reason the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'No progress data yet' }), { status: 404 }),
    )

    const failure = await getSkillProgress().catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(404)
    expect((failure as Error).message).toBe('No progress data yet')
  })
})
