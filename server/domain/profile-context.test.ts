import { describe, expect, it } from 'vitest'
import type { LearningProfile } from '@shared/domain.js'
import { describeLearningProfile } from './profile-context.js'

// describeLearningProfile is pure domain logic: format a LearningProfile into
// the "Reader profile:" prompt fragment every generation prompt embeds.
// No I/O, no defaults for a missing profile — that is
// server/services/profile-context.ts's job (it reads the profile through
// BookRepository and swallows "no profile saved yet" into '').

const basePreferences: LearningProfile['preferences'] = {
  explainComplexTermsSimply: false,
  codeExamples: false,
  realWorldAnalogies: false,
  includeRecaps: false,
  includeSummaries: false,
  visualDescriptions: false,
  depthLevel: 1,
  pacePreference: 1,
  metaphorDensity: 1,
  narrativeStyle: 1,
  humorLevel: 1,
  formalityLevel: 1,
}

function makeProfile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    style: '',
    identity: '',
    preferences: basePreferences,
    skills: [],
    ...overrides,
  }
}

describe('describeLearningProfile', () => {
  it('includes reader background and learning style when set', () => {
    const context = describeLearningProfile(makeProfile({ identity: 'Senior backend engineer', style: 'hands-on with real code' }))
    expect(context).toContain('Reader background: Senior backend engineer')
    expect(context).toContain('Preferred learning style: hands-on with real code')
  })

  it('omits background and style lines when both are empty', () => {
    const context = describeLearningProfile(makeProfile())
    expect(context).not.toContain('Reader background:')
    expect(context).not.toContain('Preferred learning style:')
  })

  it('lists only the boolean preferences that are on, plus every slider label at level 1', () => {
    const context = describeLearningProfile(makeProfile({
      preferences: { ...basePreferences, codeExamples: true, includeRecaps: true },
    }))
    expect(context).toContain('include code examples')
    expect(context).toContain('recap previous material at chapter start')
    expect(context).not.toContain('explain complex terms simply')
    expect(context).not.toContain('use real-world analogies')
    expect(context).toContain('depth: high-level overview')
    expect(context).toContain('pace: very deliberate pace')
    expect(context).toContain('metaphors: very rare metaphors')
    expect(context).toContain('style: strictly technical')
    expect(context).toContain('humor: strictly serious')
    expect(context).toContain('formality: very casual')
  })

  it('reports no explicit skill ratings when the skills array is empty', () => {
    const context = describeLearningProfile(makeProfile())
    expect(context).toContain('No explicit skill ratings provided — infer prior knowledge from the reader background above')
  })

  it('buckets skills into strong, moderate, and limited knowledge', () => {
    const context = describeLearningProfile(makeProfile({
      skills: [
        { name: 'TypeScript', level: 9 },
        { name: 'Rust', level: 5 },
        { name: 'Category Theory', level: 2 },
      ],
    }))
    expect(context).toContain('Strong knowledge (>=7): TypeScript (9/10)')
    expect(context).toContain('Moderate knowledge (4-6): Rust (5/10)')
    expect(context).toContain('Limited knowledge (<=3): Category Theory (2/10)')
    expect(context).toContain('Adjust depth — skip basics for strong areas, explain fundamentals for weak areas')
    expect(context).not.toContain('No explicit skill ratings provided')
  })
})
