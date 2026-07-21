import { describe, it, expect } from 'vitest'
import type { BookMeta, LearningProfile } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createSuggestProfileUpdates } from './suggest-profile-updates.js'

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1', title: 'Rust for Rubyists', prompt: 'Learn Rust from a Ruby background.',
    status: 'reading', totalChapters: 3, generatedUpTo: 2,
    createdAt: '', updatedAt: '', tags: [], audioGeneratedChapters: [],
    ...overrides,
  }
}

const FULL_PREFERENCES: LearningProfile['preferences'] = {
  explainComplexTermsSimply: true,
  codeExamples: false,
  realWorldAnalogies: true,
  includeRecaps: false,
  includeSummaries: true,
  visualDescriptions: false,
  depthLevel: 4,
  pacePreference: 2,
  metaphorDensity: 5,
  narrativeStyle: 1,
  humorLevel: 3,
  formalityLevel: 2,
}

const SUGGESTION_RESPONSE = {
  rationale: 'Reader scored well on ownership questions.',
  skills: { added: [{ name: 'Rust', level: 3 }], removed: [], updated: [] },
  preferences: [],
  aboutMe: 'A backend engineer now learning Rust.',
}

async function seedBaseline(books: ReturnType<typeof createFakeBookRepository>) {
  await books.saveBook(makeBook())
  await books.saveToc('book-1', { chapters: [{ title: 'Ownership', description: 'Move semantics.' }, { title: 'Borrowing', description: 'References.' }] })
  await books.saveProfile({ style: 'Concise', identity: 'A backend engineer.', preferences: FULL_PREFERENCES, skills: [] })
}

describe('createSuggestProfileUpdates', () => {
  it('returns the suggested rationale, skills, preferences, and aboutMe verbatim', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    const result = await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    expect(result).toEqual(SUGGESTION_RESPONSE)
  })

  it('includes the book title, topic, and table of contents, omitting rating and quiz score when unset', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('Book just completed: "Rust for Rubyists"')
    expect(prompt).toContain('Topic: Learn Rust from a Ruby background.')
    expect(prompt).toContain('1. Ownership — Move semantics.')
    expect(prompt).toContain('2. Borrowing — References.')
    expect(prompt).not.toContain('Reader rating')
    expect(prompt).not.toContain('Final quiz score')
  })

  it('includes the reader rating and final quiz score when the book has them', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ rating: 4.5, finalQuizScore: 8, finalQuizTotal: 10 }))
    await books.saveToc('book-1', { chapters: [{ title: 'Ownership', description: '' }] })
    await books.saveProfile({ style: '', identity: '', preferences: FULL_PREFERENCES, skills: [] })
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('Reader rating: 4.5/5')
    expect(prompt).toContain('Final quiz score: 8/10')
  })

  it('excerpts each generated chapter to 300 characters and skips a chapter that has not been saved yet', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 2 }))
    await books.saveToc('book-1', { chapters: [{ title: 'Ownership', description: '' }, { title: 'Borrowing', description: '' }] })
    await books.saveChapter('book-1', 1, 'X'.repeat(500))
    // Chapter 2 deliberately not saved.
    await books.saveProfile({ style: '', identity: '', preferences: FULL_PREFERENCES, skills: [] })
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain(`Chapter 1 "Ownership": ${'X'.repeat(300)}...`)
    expect(prompt).not.toContain('X'.repeat(301))
    expect(prompt).not.toContain('Chapter 2 "Borrowing"')
  })

  it('names the chapter and question the reader did worst on in the per-chapter feedback context', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    await books.saveFeedback('book-1', 2, {
      chapter: 2,
      feedback: {},
      quiz: {
        score: 0,
        questions: [{ question: 'What does the borrow checker enforce?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, correct: false }],
      },
    })
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('Chapter 2: Quiz score: 0/1. Struggled with: What does the borrow checker enforce?')
  })

  it('falls back to "No feedback recorded." when the book has no feedback', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    expect(textGeneration.requests.generateObject[0].prompt).toContain('No feedback recorded.')
  })

  it('describes the current profile\'s skills as "None" when there are no skills yet', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    expect(textGeneration.requests.generateObject[0].prompt).toContain('- Skills: None')
  })

  it('describes existing skills and every preference with its labeled slider value', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook())
    await books.saveToc('book-1', { chapters: [{ title: 'Ownership', description: '' }] })
    await books.saveProfile({ style: '', identity: '', preferences: FULL_PREFERENCES, skills: [{ name: 'Ruby', level: 8 }] })
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('- Skills: Ruby (8/10)')
    expect(prompt).toContain('Code examples: Off')
    expect(prompt).toContain('Depth: detailed (4/5)')
    expect(prompt).toContain('Pace: measured pace (2/5)')
    expect(prompt).toContain('Style: strictly technical (1/5)')
  })

  it('includes the analytics-advisor system prompt and the shared markdown formatting rules', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })

    const { system } = textGeneration.requests.generateObject[0]
    expect(system).toContain('learning analytics advisor')
    expect(system).toContain('Be conservative')
    expect(system).toContain('Markdown formatting rules')
  })

  it('defaults the provider to anthropic and honors an explicit one', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await seedBaseline(books)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)
    textGeneration.scriptGenerateObject(SUGGESTION_RESPONSE)

    const suggestProfileUpdates = createSuggestProfileUpdates({ books, textGeneration })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'claude-x' })
    await suggestProfileUpdates({ bookId: 'book-1', model: 'gpt-x', provider: 'openai' })

    expect(textGeneration.requests.generateObject[0].model).toEqual({ provider: 'anthropic', model: 'claude-x' })
    expect(textGeneration.requests.generateObject[1].model).toEqual({ provider: 'openai', model: 'gpt-x' })
  })
})
