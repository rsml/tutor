import { describe, it, expect } from 'vitest'
import type { LearningProfile } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { getProfile } from './get-profile.js'

const PREFERENCES: LearningProfile['preferences'] = {
  explainComplexTermsSimply: true,
  codeExamples: true,
  realWorldAnalogies: true,
  includeRecaps: true,
  includeSummaries: true,
  visualDescriptions: false,
  depthLevel: 3,
  pacePreference: 3,
  metaphorDensity: 3,
  narrativeStyle: 3,
  humorLevel: 2,
  formalityLevel: 3,
}

describe('getProfile', () => {
  it('joins identity and style into a single aboutMe string', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveProfile({
      identity: 'A backend engineer.',
      style: 'Prefers terse explanations.',
      preferences: PREFERENCES,
      skills: [],
    })

    const result = await getProfile({ bookRepository })

    expect(result.aboutMe).toBe('A backend engineer.\n\nPrefers terse explanations.')
  })

  it('omits either half of aboutMe when it is empty, without a stray blank line', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveProfile({ identity: 'A backend engineer.', style: '', preferences: PREFERENCES, skills: [] })

    const result = await getProfile({ bookRepository })

    expect(result.aboutMe).toBe('A backend engineer.')
  })

  it('passes preferences and skills through unchanged', async () => {
    const bookRepository = createFakeBookRepository()
    const skills = [{ name: 'TypeScript', level: 7 }]
    await bookRepository.saveProfile({ identity: '', style: '', preferences: PREFERENCES, skills })

    const result = await getProfile({ bookRepository })

    expect(result.preferences).toEqual(PREFERENCES)
    expect(result.skills).toEqual(skills)
  })

  it('defaults skills to an empty array when the stored profile has none at all', async () => {
    const bookRepository = createFakeBookRepository()
    // Simulates legacy on-disk data saved before the skills field existed,
    // which bypasses the schema default that would otherwise fill it in.
    await bookRepository.saveProfile({ identity: '', style: '', preferences: PREFERENCES } as LearningProfile)

    const result = await getProfile({ bookRepository })

    expect(result.skills).toEqual([])
  })

  it('rejects when no profile has ever been saved', async () => {
    const bookRepository = createFakeBookRepository()

    await expect(getProfile({ bookRepository })).rejects.toThrow()
  })
})
