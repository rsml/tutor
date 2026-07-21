import { describe, expect, it, vi } from 'vitest'
import type { BookMeta, Toc } from '@shared/domain.js'
import type { StartBookEvent } from '@shared/events.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { createStartBook } from './start-book.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'

const BOOK: BookMeta = {
  id: 'book-1',
  title: 'Resilient CSS',
  prompt: 'CSS Layout\n\nFocus on Grid and Flexbox',
  status: 'toc_review',
  totalChapters: 2,
  generatedUpTo: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

const TOC: Toc = {
  chapters: [
    { title: 'The Box Model Revisited', description: 'Understanding the foundation.' },
    { title: 'Flexbox Deep Dive', description: 'Layout patterns.' },
  ],
}

function makeDeps() {
  const ai = createFakeTextGeneration()
  const books = createFakeBookRepository()
  const clock = createFakeClock()
  return { ai, books, clock }
}

async function seed(books: ReturnType<typeof createFakeBookRepository>) {
  await books.saveBook(BOOK)
  await books.saveToc(BOOK.id, TOC)
}

async function collectEvents(fn: (send: (e: StartBookEvent) => void) => Promise<void>): Promise<StartBookEvent[]> {
  const events: StartBookEvent[] = []
  await fn((e) => events.push(e))
  return events
}

describe('createStartBook', () => {
  it('classifies skills, streams chapter 1, saves it, generates its quiz, and finalizes the book', async () => {
    const { ai, books, clock } = makeDeps()
    await seed(books)
    ai.scriptGenerateObject({
      skills: [{ name: 'Layout Systems', weight: 5 }],
      chapters: [
        { chapterIndex: 0, skills: [{ skill: 'Layout Systems', subskill: 'Box Model', weight: 2 }] },
        { chapterIndex: 1, skills: [] },
      ],
    })
    ai.scriptStreamText(['# Chapter One\n', 'content here'])
    ai.scriptGenerateObject({ questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }] })
    const startBook = createStartBook({ ai, books, clock })

    const events = await collectEvents((send) => startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send))

    expect(events[0]).toEqual({ type: 'skills_classified' })
    expect(events.some(e => e.type === 'chapter')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done', bookId: BOOK.id })

    const toc = await books.getToc(BOOK.id)
    expect(toc.skills).toEqual([{ name: 'Layout Systems', weight: 5 }])
    expect(toc.chapters[0].skills).toEqual([{ skill: 'Layout Systems', subskill: 'Box Model', weight: 2 }])

    await expect(books.getChapter(BOOK.id, 1)).resolves.toBe('# Chapter One\ncontent here')
    await expect(books.quizExists(BOOK.id, 1)).resolves.toBe(true)

    const meta = await books.getBook(BOOK.id)
    expect(meta.status).toBe('reading')
    expect(meta.generatedUpTo).toBe(1)
    expect(meta.updatedAt).toBe(clock.nowIso())
  })

  it('proceeds without skills when classification fails, without emitting skills_classified', async () => {
    const { books, clock } = makeDeps()
    await seed(books)
    const ai = createFakeTextGeneration()
    // No generateObject scripted for skill classification -> fake throws; the
    // second generateObject call, for the quiz, is scripted normally.
    ai.scriptStreamText(['chapter text'])
    const startBook = createStartBook({ ai, books, clock })

    const events = await collectEvents(async (send) => {
      ai.scriptGenerateObject({ questions: [] }) // queued after start, consumed by the quiz step, not skills
      await startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send)
    })

    expect(events.some(e => e.type === 'skills_classified')).toBe(false)
    const toc = await books.getToc(BOOK.id)
    expect(toc.skills).toBeUndefined()
    expect(toc.chapters[0].skills).toBeUndefined()
    expect(toc.chapters[0].title).toBe('The Box Model Revisited')
  })

  it('updates the book to generating before streaming, then to reading with generatedUpTo 1 at the end', async () => {
    const { ai, books, clock } = makeDeps()
    await seed(books)
    ai.scriptGenerateObject({ skills: [], chapters: [] })
    ai.scriptStreamText(['content'])
    ai.scriptGenerateObject({ questions: [] })
    const startBook = createStartBook({ ai, books, clock })
    const saveBookSpy = vi.spyOn(books, 'saveBook')

    await collectEvents((send) => startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send))

    const statuses = saveBookSpy.mock.calls.map(c => c[0].status)
    expect(statuses).toEqual(['generating', 'reading'])
  })

  it('includes the parsed topic, details, chapter 1 title/description, and profile context in the chapter prompt', async () => {
    const { ai, books, clock } = makeDeps()
    await seed(books)
    await books.saveProfile({
      identity: 'Frontend developer', style: '',
      preferences: {
        explainComplexTermsSimply: true, codeExamples: true, realWorldAnalogies: true,
        includeRecaps: true, includeSummaries: true, visualDescriptions: false,
        depthLevel: 3, pacePreference: 3, metaphorDensity: 3, narrativeStyle: 3, humorLevel: 2, formalityLevel: 3,
      },
      skills: [],
    })
    ai.scriptGenerateObject({ skills: [], chapters: [] })
    ai.scriptStreamText(['content'])
    ai.scriptGenerateObject({ questions: [] })
    const startBook = createStartBook({ ai, books, clock })

    await collectEvents((send) => startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send))

    const chapterReq = ai.requests.streamText[0]
    expect(chapterReq.prompt).toContain('Book: Resilient CSS')
    expect(chapterReq.prompt).toContain('Topic: CSS Layout')
    expect(chapterReq.prompt).toContain('Context: Focus on Grid and Flexbox')
    expect(chapterReq.prompt).toContain('Chapter title: The Box Model Revisited')
    expect(chapterReq.system).toContain('Reader background: Frontend developer')
  })

  it('treats the whole prompt as the topic when it has no details section', async () => {
    const { ai, books, clock } = makeDeps()
    await books.saveBook({ ...BOOK, prompt: 'Just a topic, no details' })
    await books.saveToc(BOOK.id, TOC)
    ai.scriptGenerateObject({ skills: [], chapters: [] })
    ai.scriptStreamText(['content'])
    ai.scriptGenerateObject({ questions: [] })
    const startBook = createStartBook({ ai, books, clock })

    await collectEvents((send) => startBook(BOOK.id, { ...BOOK, prompt: 'Just a topic, no details' }, { model: 'claude-sonnet-4-6' }, send))

    const chapterReq = ai.requests.streamText[0]
    expect(chapterReq.prompt).toContain('Topic: Just a topic, no details')
    expect(chapterReq.prompt).not.toContain('Context:')
  })

  it('generates the first-chapter quiz without the shared markdown formatting rules', async () => {
    const { ai, books, clock } = makeDeps()
    await seed(books)
    ai.scriptGenerateObject({ skills: [], chapters: [] })
    ai.scriptStreamText(['content'])
    ai.scriptGenerateObject({ questions: [] })
    const startBook = createStartBook({ ai, books, clock })

    await collectEvents((send) => startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send))

    const quizReq = ai.requests.generateObject[1] // [0] is skill classification, [1] is the quiz
    expect(quizReq.prompt).not.toContain(MARKDOWN_FORMATTING_RULES)
  })

  it('still saves chapter 1 and finishes reading when quiz generation fails', async () => {
    const { books, clock } = makeDeps()
    await seed(books)
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ skills: [], chapters: [] })
    ai.scriptStreamText(['content'])
    // No further generateObject scripted -> quiz generation throws, non-fatally.
    const startBook = createStartBook({ ai, books, clock })

    const events = await collectEvents((send) => startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send))

    expect(events.at(-1)).toEqual({ type: 'done', bookId: BOOK.id })
    await expect(books.getChapter(BOOK.id, 1)).resolves.toBe('content')
    await expect(books.quizExists(BOOK.id, 1)).resolves.toBe(false)
    const meta = await books.getBook(BOOK.id)
    expect(meta.status).toBe('reading')
  })

  it('reports the thrown error and leaves the book generating when chapter streaming fails', async () => {
    const { books, clock } = makeDeps()
    await seed(books)
    const ai = createFakeTextGeneration()
    ai.scriptGenerateObject({ skills: [], chapters: [] })
    ai.streamText = () => { throw new Error('model overloaded') }
    const startBook = createStartBook({ ai, books, clock })

    const events = await collectEvents((send) => startBook(BOOK.id, BOOK, { model: 'claude-sonnet-4-6' }, send))

    expect(events).toContainEqual({ type: 'error', message: 'model overloaded' })
    const meta = await books.getBook(BOOK.id)
    expect(meta.status).toBe('generating')
  })
})
