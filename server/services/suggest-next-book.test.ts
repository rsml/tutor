import { describe, it, expect } from 'vitest'
import type { BookMeta, LearningProfile } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createSuggestNextBook } from './suggest-next-book.js'

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1', title: 'Rust for Rubyists', prompt: 'Learn Rust from a Ruby background.',
    status: 'reading', totalChapters: 10, generatedUpTo: 2,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    tags: [], audioGeneratedChapters: [],
    ...overrides,
  }
}

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

describe('createSuggestNextBook', () => {
  it('falls back to "No books or quiz data yet." and "No profile available." with nothing recorded', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({ model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('No books or quiz data yet.')
    expect(prompt).toContain('=== LAYER 1: LEARNER PROFILE (baseline identity + preferences) ===\nNo profile available.')
    expect(prompt).toContain('No skill mastery data yet.')
  })

  it('numbers each book\'s evidence summary in the exact order the repository returns', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ id: 'book-a', title: 'Book A', createdAt: '2026-01-01T00:00:00.000Z' }))
    await books.saveBook(makeBook({ id: 'book-b', title: 'Book B', createdAt: '2026-01-05T00:00:00.000Z' }))
    await books.saveToc('book-a', { chapters: [{ title: 'A1', description: '' }] })
    // book-b deliberately has no TOC saved, exercising the "no toc yet" skip.
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({ model: 'claude-x' })

    const [first, second] = await books.listBooks()
    const { prompt } = textGeneration.requests.generateObject[0]
    const layer2 = prompt.split('=== LAYER 2')[1].split('=== LAYER 3')[0]
    expect(layer2.indexOf(`1. "${first.title}"`)).toBeGreaterThan(-1)
    expect(layer2.indexOf(`2. "${second.title}"`)).toBeGreaterThan(layer2.indexOf(`1. "${first.title}"`))
  })

  it('passes each book\'s client quiz history through by book id', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ id: 'book-a' }))
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({
      model: 'claude-x',
      quizHistory: {
        'book-a': {
          '1': {
            questions: [{ question: 'CQ?', options: ['a', 'b'], correctIndex: 0 }],
            attempts: [{ score: 1, answers: [{ selectedAnswer: 0, correct: true }] }],
          },
        },
      },
    })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('Client quiz: 1/1')
  })

  it.each([
    ['deepen', 'DEEPEN EXISTING SKILLS'],
    ['complementary', 'LEARN COMPLEMENTARY SKILLS'],
  ] as const)('describes %s mode with its own instructions', async (mode, expectedText) => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({ model: 'claude-x', mode })

    expect(textGeneration.requests.generateObject[0].prompt).toContain(expectedText)
  })

  it('describes no particular mode with a general growth instruction when mode is omitted', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({ model: 'claude-x' })

    expect(textGeneration.requests.generateObject[0].prompt).toContain('most valuable for the reader\'s growth')
  })

  it('sends the schemaName and schemaDescription and returns the suggested topic, details, and reasoning', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ topic: 'Event-Driven Node.js', details: 'Go deep on queues.', reasoning: 'Fills a gap.' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    const result = await suggestNextBook({ model: 'claude-x' })

    expect(result).toEqual({ topic: 'Event-Driven Node.js', details: 'Go deep on queues.', reasoning: 'Fills a gap.' })
    expect(textGeneration.requests.generateObject[0].schemaName).toBe('BookSuggestion')
    expect(textGeneration.requests.generateObject[0].schemaDescription).toContain('topic, details, and reasoning')
  })

  it('defaults the provider to anthropic and honors an explicit one', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({ model: 'claude-x' })
    await suggestNextBook({ model: 'gpt-x', provider: 'openai' })

    expect(textGeneration.requests.generateObject[0].model).toEqual({ provider: 'anthropic', model: 'claude-x' })
    expect(textGeneration.requests.generateObject[1].model).toEqual({ provider: 'openai', model: 'gpt-x' })
  })

  it('includes the reader\'s learning profile context and last-updated date in the prompt', async () => {
    // getProfileContext(deps.books) and deps.books.getProfileUpdatedAt() both
    // read the same injected BookRepository now, so one seed on the fake
    // proves both the profile's actual value and its last-updated date reach
    // the prompt.
    const books = createFakeBookRepository()
    await books.saveProfile({
      style: 'Concise, example-driven',
      identity: 'A backend engineer curious about Rust.',
      preferences: FULL_PREFERENCES,
      skills: [],
    })
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ topic: 'T', details: 'D', reasoning: 'R' })

    const suggestNextBook = createSuggestNextBook({ books, textGeneration })
    await suggestNextBook({ model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('Reader background: A backend engineer curious about Rust.')
    expect(prompt).toContain('Profile last updated:')
  })
})
