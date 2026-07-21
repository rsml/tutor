import { describe, it, expect } from 'vitest'
import type { LearningProfile } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { saveProfile } from './save-profile.js'

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

describe('saveProfile', () => {
  it('stores aboutMe as identity, leaves style blank, and passes preferences and skills through', async () => {
    const bookRepository = createFakeBookRepository()

    await saveProfile({ bookRepository }, {
      aboutMe: 'A backend engineer.',
      preferences: PREFERENCES,
      skills: [{ name: 'TypeScript', level: 7 }],
    })

    await expect(bookRepository.getProfile()).resolves.toEqual({
      identity: 'A backend engineer.',
      style: '',
      preferences: PREFERENCES,
      skills: [{ name: 'TypeScript', level: 7 }],
    })
  })

  it('defaults skills to an empty array when none are given', async () => {
    const bookRepository = createFakeBookRepository()

    await saveProfile({ bookRepository }, { aboutMe: 'A backend engineer.', preferences: PREFERENCES })

    await expect(bookRepository.getProfile()).resolves.toMatchObject({ skills: [] })
  })
})
