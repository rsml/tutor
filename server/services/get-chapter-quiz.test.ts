import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import type { BookMeta, Quiz } from '@shared/domain.js'
import { generateQuiz } from './generation-manager.js'
import { createGetChapterQuiz } from './get-chapter-quiz.js'

// get-chapter-quiz still delegates on-demand generation to
// generation-manager.ts's generateQuiz, exactly as assessment.ts does today
// — that sibling-owned module is not part of this slice and is not
// converted to the TextGeneration port here. Mocking its single named
// export (vitest hoists this above the imports above) lets this test drive
// the full "quiz missing, generate on demand" path deterministically, with
// no real AI SDK call and no network.
vi.mock('./generation-manager.js', () => ({ generateQuiz: vi.fn() }))

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1', title: 'T', prompt: 'P', status: 'reading',
    totalChapters: 3, generatedUpTo: 2, createdAt: '', updatedAt: '',
    tags: [], audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('createGetChapterQuiz', () => {
  beforeEach(() => {
    vi.mocked(generateQuiz).mockReset()
  })

  it('returns an existing quiz verbatim, without generating one', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const quiz: Quiz = { questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }] }
    await books.saveQuiz('book-1', 1, quiz)

    const getChapterQuiz = createGetChapterQuiz({ books })
    const result = await getChapterQuiz({ bookId: 'book-1', chapterNum: 1 })

    expect(result).toEqual(quiz)
    expect(generateQuiz).not.toHaveBeenCalled()
  })

  it('rejects with a 400 when the chapter number is out of the book\'s range', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 2 }))

    const getChapterQuiz = createGetChapterQuiz({ books })
    await expect(getChapterQuiz({ bookId: 'book-1', chapterNum: 5 })).rejects.toMatchObject({
      message: 'Chapter 5 out of range (1-2)',
      statusCode: 400,
    })
    expect(generateQuiz).not.toHaveBeenCalled()
  })

  it('generates a quiz on demand when none is saved, and saves the result', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveChapter('book-1', 1, 'Chapter one content.')

    const generated: Quiz = { questions: [{ question: 'Generated?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] }
    vi.mocked(generateQuiz).mockResolvedValue(generated)

    const getChapterQuiz = createGetChapterQuiz({ books })
    const result = await getChapterQuiz({ bookId: 'book-1', chapterNum: 1, model: 'claude-x', provider: 'openai', quizLength: 7 })

    expect(generateQuiz).toHaveBeenCalledWith('openai', 'claude-x', 'Chapter one content.', 7)
    expect(result).toEqual(generated)
    await expect(books.getQuiz('book-1', 1)).resolves.toEqual(generated)
  })

  it('defaults model, provider, and quiz length when the request omits them', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveChapter('book-1', 1, 'Content.')
    vi.mocked(generateQuiz).mockResolvedValue({ questions: [] })

    const getChapterQuiz = createGetChapterQuiz({ books })
    await getChapterQuiz({ bookId: 'book-1', chapterNum: 1 })

    expect(generateQuiz).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4-6', 'Content.', 3)
  })
})
