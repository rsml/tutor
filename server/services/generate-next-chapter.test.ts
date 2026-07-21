import { describe, expect, it, vi } from 'vitest'
import type { BookMeta, Toc } from '@shared/domain.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { createGenerateNextChapter } from './generate-next-chapter.js'

const BOOK: BookMeta = {
  id: 'book-1',
  title: 'Distributed Systems',
  prompt: 'Learn distributed systems',
  status: 'reading',
  totalChapters: 3,
  generatedUpTo: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

const TOC: Toc = {
  chapters: [
    { title: 'Intro', description: 'The basics.' },
    { title: 'Consensus', description: 'Agreeing under failure.' },
    { title: 'Replication', description: 'Copies of the truth.' },
  ],
}

async function makeDeps() {
  const ai = createFakeTextGeneration()
  const books = createFakeBookRepository()
  const clock = createFakeClock()
  await books.saveBook(BOOK)
  await books.saveToc(BOOK.id, TOC)
  return { ai, books, clock }
}

describe('createGenerateNextChapter', () => {
  it('streams chapter text chunk by chunk and returns the full content', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['Once ', 'upon ', 'a time.'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    const chunks: string[] = []
    const content = await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' }, (c) => chunks.push(c))

    expect(content).toBe('Once upon a time.')
    expect(chunks).toEqual(['Once ', 'upon ', 'a time.'])
  })

  it('saves the chapter content before generating its quiz', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['content'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })
    const saveChapterSpy = vi.spyOn(books, 'saveChapter')
    const saveQuizSpy = vi.spyOn(books, 'saveQuiz')

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' })

    expect(saveChapterSpy).toHaveBeenCalledWith(BOOK.id, 2, 'content')
    expect(saveQuizSpy).toHaveBeenCalledTimes(1)
    expect(saveChapterSpy.mock.invocationCallOrder[0]).toBeLessThan(saveQuizSpy.mock.invocationCallOrder[0])
  })

  it('includes the chapter title, description, book title, and profile context in the prompt', async () => {
    const { ai, books, clock } = await makeDeps()
    await books.saveProfile({
      identity: 'Backend engineer',
      style: '',
      preferences: {
        explainComplexTermsSimply: true, codeExamples: true, realWorldAnalogies: true,
        includeRecaps: true, includeSummaries: true, visualDescriptions: false,
        depthLevel: 3, pacePreference: 3, metaphorDensity: 3, narrativeStyle: 3, humorLevel: 2, formalityLevel: 3,
      },
      skills: [],
    })
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' })

    const req = ai.requests.streamText[0]
    expect(req.prompt).toContain('Book: Distributed Systems')
    expect(req.prompt).toContain('Chapter title: Consensus')
    expect(req.prompt).toContain('Chapter description: Agreeing under failure.')
    expect(req.system).toContain('Reader background: Backend engineer')
  })

  it('includes prior feedback, marking liked/disliked as opaque data and noting quiz struggles', async () => {
    const { ai, books, clock } = await makeDeps()
    await books.saveFeedback(BOOK.id, 1, {
      chapter: 1,
      feedback: { liked: 'the analogies', disliked: 'too slow' },
      quiz: {
        score: 1,
        questions: [
          { question: 'What is CAP?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, userAnswer: 1, correct: false },
        ],
      },
    })
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' })

    const req = ai.requests.streamText[0]
    expect(req.prompt).toContain('<reader_liked>the analogies</reader_liked>')
    expect(req.prompt).toContain('<reader_disliked>too slow</reader_disliked>')
    expect(req.prompt).toContain('Struggled with: What is CAP?')
  })

  it('includes the previous chapter tail for continuity when one exists', async () => {
    const { ai, books, clock } = await makeDeps()
    await books.saveChapter(BOOK.id, 1, 'The first chapter ends here.')
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' })

    expect(ai.requests.streamText[0].prompt).toContain('Previous chapter ended with:\nThe first chapter ends here.')
  })

  it('omits the previous-chapter section for chapter 1, where none exists', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 1, { model: 'claude-sonnet-4-6' })

    expect(ai.requests.streamText[0].prompt).not.toContain('Previous chapter ended with:')
  })

  it('advances generatedUpTo and updatedAt when generating a chapter past the current one', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' })

    const meta = await books.getBook(BOOK.id)
    expect(meta.generatedUpTo).toBe(2)
    expect(meta.updatedAt).toBe(clock.nowIso())
  })

  it('leaves generatedUpTo and updatedAt untouched when regenerating an already-generated chapter', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 1, { model: 'claude-sonnet-4-6' })

    const meta = await books.getBook(BOOK.id)
    expect(meta.generatedUpTo).toBe(1)
    expect(meta.updatedAt).toBe(BOOK.updatedAt)
  })

  it('does not fail the whole generation when quiz generation fails, but still saves the chapter', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['saved content'])
    // No generateObject scripted -> the fake throws when the quiz step calls it.
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    const content = await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' })

    expect(content).toBe('saved content')
    await expect(books.getChapter(BOOK.id, 2)).resolves.toBe('saved content')
    await expect(books.quizExists(BOOK.id, 2)).resolves.toBe(false)
  })

  it('falls back the quiz model/provider to the chapter model/provider when not given', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6', provider: 'openai' })

    expect(ai.requests.generateObject[0].model).toEqual({ provider: 'openai', model: 'claude-sonnet-4-6' })
  })

  it('uses the given quiz model/provider/length when specified', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })

    await generateNextChapter(BOOK.id, 2, {
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      quizModel: 'gpt-5',
      quizProvider: 'openai',
      quizLength: 7,
    })

    expect(ai.requests.generateObject[0].model).toEqual({ provider: 'openai', model: 'gpt-5' })
    expect(ai.requests.generateObject[0].prompt).toContain('generate exactly 7 multiple-choice')
  })

  it('passes the cancellation signal through to the streamText call', async () => {
    const { ai, books, clock } = await makeDeps()
    ai.scriptStreamText(['x'])
    ai.scriptGenerateObject({ questions: [] })
    const generateNextChapter = createGenerateNextChapter({ ai, books, clock })
    const controller = new AbortController()

    await generateNextChapter(BOOK.id, 2, { model: 'claude-sonnet-4-6' }, undefined, controller.signal)

    expect(ai.requests.streamText[0].signal).toBe(controller.signal)
  })
})
