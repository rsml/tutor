import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import type { BookMeta } from '@shared/domain.js'
import { createGenerateFinalQuiz } from './generate-final-quiz.js'

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1', title: 'Rust for Rubyists', prompt: 'Learn Rust from a Ruby background.',
    status: 'reading', totalChapters: 10, generatedUpTo: 1,
    createdAt: '', updatedAt: '', tags: [], audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('createGenerateFinalQuiz', () => {
  it('returns the cached final quiz when one already exists, without generating a new one', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook())
    const cached = { questions: [{ question: 'Cached?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] }
    await books.saveFinalQuiz('book-1', cached)

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    const result = await generateFinalQuiz({ bookId: 'book-1', model: 'claude-x' })

    expect(result).toEqual(cached)
    expect(textGeneration.requests.generateObject).toHaveLength(0)
  })

  it('tiers the character budget and question count by book size (single chapter)', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 1, totalChapters: 10 }))
    await books.saveToc('book-1', { chapters: [{ title: 'Ownership', description: 'Move semantics.' }] })
    await books.saveChapter('book-1', 1, 'A'.repeat(9000)) // longer than the 1-chapter 8000-char budget

    const generated = { questions: [{ question: 'Generated?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] }
    textGeneration.scriptGenerateObject(generated)

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    await generateFinalQuiz({ bookId: 'book-1', model: 'claude-x', provider: 'anthropic' })

    const req = textGeneration.requests.generateObject[0]
    expect(req.model).toEqual({ provider: 'anthropic', model: 'claude-x' })
    // A single-chapter book's plan: 5 questions, DEEP COMPREHENSION focus, 8000-char budget.
    expect(req.prompt).toContain('Generate exactly 5 multiple-choice questions')
    expect(req.prompt).toContain('DEEP COMPREHENSION of the single chapter')
    expect(req.prompt).toContain('Chapter 1 "Ownership":\n' + 'A'.repeat(8000) + '...')
    expect(req.prompt).not.toContain('A'.repeat(8001))
  })

  it('tiers larger books down to the smallest per-chapter budget and the synthesis focus', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 6, totalChapters: 12 }))
    const chapters = Array.from({ length: 6 }, (_, i) => ({ title: `Ch${i + 1}`, description: `d${i + 1}` }))
    await books.saveToc('book-1', { chapters })
    for (let i = 1; i <= 6; i++) {
      await books.saveChapter('book-1', i, `content-${i}`)
    }
    textGeneration.scriptGenerateObject({ questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] })

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    await generateFinalQuiz({ bookId: 'book-1', model: 'claude-x' })

    const req = textGeneration.requests.generateObject[0]
    expect(req.prompt).toContain('Generate exactly 10 multiple-choice questions that test SYNTHESIS and CROSS-CHAPTER understanding')
    expect(req.prompt).toContain('Chapter 6 "Ch6":\ncontent-6')
  })

  it('includes the book title, topic, table of contents, quiz quality rules, and prior questions in the prompt', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 1 }))
    await books.saveToc('book-1', { chapters: [{ title: 'Ownership', description: 'Move semantics.' }] })
    await books.saveChapter('book-1', 1, 'Short content.')
    await books.saveFeedback('book-1', 1, {
      chapter: 1,
      feedback: {},
      quiz: { score: 1, questions: [{ question: 'Old question?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] },
    })
    textGeneration.scriptGenerateObject({ questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] })

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    await generateFinalQuiz({ bookId: 'book-1', model: 'claude-x' })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('Book: Rust for Rubyists')
    expect(prompt).toContain('Topic: Learn Rust from a Ruby background.')
    expect(prompt).toContain('1. Ownership — Move semantics.')
    expect(prompt).toContain('Quality rules for the options')
    expect(prompt).toContain('Old question?')
    expect(prompt).toContain('ONLY ask about concepts, facts, and ideas explicitly discussed')
  })

  it('skips a chapter that has not been saved yet without failing the whole request', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 2 }))
    await books.saveToc('book-1', { chapters: [{ title: 'One', description: '' }, { title: 'Two', description: '' }] })
    await books.saveChapter('book-1', 1, 'content-1')
    // Chapter 2 deliberately not saved.
    textGeneration.scriptGenerateObject({ questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] })

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    await expect(generateFinalQuiz({ bookId: 'book-1', model: 'claude-x' })).resolves.toBeDefined()

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('content-1')
    expect(prompt).not.toContain('Chapter 2 "Two"')
  })

  it('saves a shuffled quiz that is a permutation preserving the correct answer\'s identity', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 1 }))
    await books.saveToc('book-1', { chapters: [{ title: 'One', description: '' }] })
    await books.saveChapter('book-1', 1, 'content')
    const generated = {
      questions: [{ question: 'Q?', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctIndex: 2 }],
    }
    textGeneration.scriptGenerateObject(generated)

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    const result = await generateFinalQuiz({ bookId: 'book-1', model: 'claude-x' })

    const q = result.questions[0]
    expect([...q.options].sort()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma'])
    expect(q.options[q.correctIndex]).toBe('Gamma')
    await expect(books.getFinalQuiz('book-1')).resolves.toEqual(result)
  })

  it('defaults the provider to anthropic when the request omits it', async () => {
    const books = createFakeBookRepository()
    const textGeneration = createFakeTextGeneration()
    await books.saveBook(makeBook({ generatedUpTo: 1 }))
    await books.saveToc('book-1', { chapters: [{ title: 'One', description: '' }] })
    await books.saveChapter('book-1', 1, 'content')
    textGeneration.scriptGenerateObject({ questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] })

    const generateFinalQuiz = createGenerateFinalQuiz({ books, textGeneration })
    await generateFinalQuiz({ bookId: 'book-1', model: 'claude-x' })

    expect(textGeneration.requests.generateObject[0].model).toEqual({ provider: 'anthropic', model: 'claude-x' })
  })
})
