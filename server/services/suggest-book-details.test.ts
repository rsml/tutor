import { describe, it, expect } from 'vitest'
import type { LearningProfile } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createSuggestBookDetails } from './suggest-book-details.js'

const FULL_PREFERENCES: LearningProfile['preferences'] = {
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

describe('createSuggestBookDetails', () => {
  it('asks the model for details tailored to the given topic and returns them', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ details: 'Focus on ownership and borrowing first.' })

    const suggestBookDetails = createSuggestBookDetails({ books: createFakeBookRepository(), textGeneration })
    const result = await suggestBookDetails({ topic: 'Rust for Rubyists', model: 'claude-x' })

    expect(result).toEqual({ details: 'Focus on ownership and borrowing first.' })
    expect(textGeneration.requests.generateObject[0].prompt).toContain('Rust for Rubyists')
  })

  it('falls back to "No profile available." when no profile has been saved', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ details: 'x' })

    const suggestBookDetails = createSuggestBookDetails({ books: createFakeBookRepository(), textGeneration })
    await suggestBookDetails({ topic: 'Topic', model: 'claude-x' })

    expect(textGeneration.requests.generateObject[0].prompt).toContain('=== LEARNER PROFILE ===\nNo profile available.')
  })

  it('includes the reader\'s learning profile context in the prompt', async () => {
    const books = createFakeBookRepository()
    await books.saveProfile({
      style: 'Concise, example-driven',
      identity: 'A backend engineer curious about Rust.',
      preferences: FULL_PREFERENCES,
      skills: [],
    })

    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ details: 'x' })

    const suggestBookDetails = createSuggestBookDetails({ books, textGeneration })
    await suggestBookDetails({ topic: 'Topic', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('=== LEARNER PROFILE ===')
    expect(prompt).toContain('Reader background: A backend engineer curious about Rust.')
  })

  it('defaults the provider to anthropic when the request omits it', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ details: 'x' })

    const suggestBookDetails = createSuggestBookDetails({ books: createFakeBookRepository(), textGeneration })
    await suggestBookDetails({ topic: 'Topic', model: 'claude-x' })

    expect(textGeneration.requests.generateObject[0].model).toEqual({ provider: 'anthropic', model: 'claude-x' })
  })

  it('uses the given provider when one is supplied', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ details: 'x' })

    const suggestBookDetails = createSuggestBookDetails({ books: createFakeBookRepository(), textGeneration })
    await suggestBookDetails({ topic: 'Topic', model: 'gpt-x', provider: 'openai' })

    expect(textGeneration.requests.generateObject[0].model).toEqual({ provider: 'openai', model: 'gpt-x' })
  })
})
