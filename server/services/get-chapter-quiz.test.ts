import { describe, it, expect } from 'vitest'
import type { BookMeta, Quiz } from '@shared/domain.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { DEFAULT_MODEL, DEFAULT_QUIZ_LENGTH } from '../constants.js'
import { createGetChapterQuiz } from './get-chapter-quiz.js'

// On-demand generation now goes straight through generate-quiz.ts's
// createGenerateQuiz against an injected TextGeneration port, instead of
// generation-manager.ts's generateQuiz shim, so these tests script and
// assert against the AI port directly rather than mocking a module.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1', title: 'T', prompt: 'P', status: 'reading',
    totalChapters: 3, generatedUpTo: 2, createdAt: '', updatedAt: '',
    tags: [], audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('createGetChapterQuiz', () => {
  it('returns an existing quiz verbatim, without generating one', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const quiz: Quiz = { questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }] }
    await books.saveQuiz('book-1', 1, quiz)
    const textGeneration = createFakeTextGeneration()

    const getChapterQuiz = createGetChapterQuiz({ books, textGeneration })
    const result = await getChapterQuiz({ bookId: 'book-1', chapterNum: 1 })

    expect(result).toEqual(quiz)
    expect(textGeneration.requests.generateObject).toHaveLength(0)
  })

  it('rejects with a 400 when the chapter number is out of the book\'s range', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 2 }))
    const textGeneration = createFakeTextGeneration()

    const getChapterQuiz = createGetChapterQuiz({ books, textGeneration })
    await expect(getChapterQuiz({ bookId: 'book-1', chapterNum: 5 })).rejects.toMatchObject({
      message: 'Chapter 5 out of range (1-2)',
      statusCode: 400,
    })
    expect(textGeneration.requests.generateObject).toHaveLength(0)
  })

  it('generates a quiz on demand when none is saved, and saves the result', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveChapter('book-1', 1, 'Chapter one content.')
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({
      questions: [{ question: 'Generated?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
    })

    const getChapterQuiz = createGetChapterQuiz({ books, textGeneration })
    const result = await getChapterQuiz({ bookId: 'book-1', chapterNum: 1, model: 'claude-x', provider: 'openai', quizLength: 7 })

    const req = textGeneration.requests.generateObject[0]
    expect(req.model).toEqual({ provider: 'openai', model: 'claude-x' })
    expect(req.prompt).toContain('generate exactly 7 multiple-choice quiz questions')
    expect(req.prompt).toContain('Chapter one content.')
    // includeFormattingRules is always true for on-demand generation here,
    // unlike generate-quiz.ts's own default of false — the one behaviour
    // this call site must not silently drop when it stopped going through
    // generation-manager.ts's copy, which always included these rules.
    expect(req.prompt).toContain(MARKDOWN_FORMATTING_RULES)

    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].options).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']))
    expect(result.questions[0].options[result.questions[0].correctIndex]).toBe('a')
    await expect(books.getQuiz('book-1', 1)).resolves.toEqual(result)
  })

  it('defaults model, provider, and quiz length when the request omits them', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveChapter('book-1', 1, 'Content.')
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ questions: [] })

    const getChapterQuiz = createGetChapterQuiz({ books, textGeneration })
    await getChapterQuiz({ bookId: 'book-1', chapterNum: 1 })

    const req = textGeneration.requests.generateObject[0]
    expect(req.model).toEqual({ provider: 'anthropic', model: DEFAULT_MODEL })
    expect(req.prompt).toContain(`generate exactly ${DEFAULT_QUIZ_LENGTH} multiple-choice`)
  })
})
