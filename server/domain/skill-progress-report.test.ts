import { describe, expect, it } from 'vitest'
import type { SkillProgress } from '@shared/responses.js'
import { formatSkillProgress } from './skill-progress-report.js'

const base: SkillProgress = {
  stats: { totalBooks: 2, completedBooks: 1, totalChapters: 10, completedChapters: 6 },
  skills: [
    {
      name: 'TypeScript',
      totalWeight: 10,
      completedWeight: 5,
      lastActivityAt: '2026-07-01T12:00:00Z',
      books: [
        { bookId: 'ts-basics', title: 'TS Basics', weight: 6, completed: true, lastActivityAt: '2026-06-30T09:00:00Z' },
        { bookId: 'ts-advanced', title: 'TS Advanced', weight: 4, completed: false },
      ],
      subskills: [
        { name: 'generics', totalWeight: 4, completedWeight: 1 },
        { name: 'narrowing', totalWeight: 4, completedWeight: 3 },
        { name: 'unstarted', totalWeight: 0, completedWeight: 0 },
      ],
    },
  ],
}

describe('formatSkillProgress', () => {
  it('returns the empty string when there are no skills, so callers can show their own placeholder', () => {
    expect(formatSkillProgress({ ...base, skills: [] })).toBe('')
  })

  it('opens with the overall books and chapters rollup', () => {
    expect(formatSkillProgress(base)).toMatch(/^Overall: 1\/2 books completed, 6\/10 chapters completed/)
  })

  it('renders mastery percent, truncated last-activity date, and the teaching books', () => {
    const text = formatSkillProgress(base)
    expect(text).toContain('TypeScript: 50% mastery (last activity: 2026-07-01)')
    expect(text).toContain('TS Basics (completed, last: 2026-06-30)')
    expect(text).toContain('TS Advanced (in progress)')
  })

  it('buckets subskills at the 50 percent line and skips zero-weight ones', () => {
    const text = formatSkillProgress(base)
    expect(text).toContain('Weak subskills (< 50%): generics (25%)')
    expect(text).toContain('Strong subskills (>= 50%): narrowing (75%)')
    expect(text).not.toContain('unstarted')
  })

  it('treats a zero-weight skill as zero percent mastery instead of dividing by zero', () => {
    const zero: SkillProgress = {
      ...base,
      skills: [{ ...base.skills[0], totalWeight: 0, completedWeight: 0, subskills: [] }],
    }
    expect(formatSkillProgress(zero)).toContain('TypeScript: 0% mastery')
  })
})
