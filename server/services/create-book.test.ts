import { describe, expect, it } from 'vitest'
import type { CreateBookEvent } from '@shared/events.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { createCreateBook } from './create-book.js'

const TOC_MARKDOWN = `# Resilient CSS
*Layout Systems for the Real World*

1. **The Box Model Revisited** — Understanding the foundation that everything else builds on.
2. **Flexbox Deep Dive** — Layout patterns that solve real problems elegantly.`

function makeDeps() {
  const ai = createFakeTextGeneration()
  const books = createFakeBookRepository()
  const clock = createFakeClock()
  return { ai, books, clock }
}

async function collectEvents(fn: (send: (e: CreateBookEvent) => void) => Promise<void>): Promise<CreateBookEvent[]> {
  const events: CreateBookEvent[] = []
  await fn((e) => events.push(e))
  return events
}

describe('createCreateBook', () => {
  it('persists the book as generating_toc immediately and announces it', async () => {
    const { ai, books, clock } = makeDeps()
    ai.scriptStreamText([TOC_MARKDOWN])
    const createBook = createCreateBook({ ai, books, clock })

    const events = await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', model: 'claude-sonnet-4-6' }, send))

    expect(events[0]).toEqual({ type: 'book_created', bookId: 'book-1', title: 'CSS Layout', totalChapters: 12 })
  })

  it('streams the table of contents and, once parsed, saves it and finalizes the book', async () => {
    const { ai, books, clock } = makeDeps()
    ai.scriptStreamText(['# Resilient CSS\n', '*Layout Systems for the Real World*\n\n', '1. **The Box Model Revisited** — Understanding the foundation.\n', '2. **Flexbox Deep Dive** — Layout patterns.'])
    const createBook = createCreateBook({ ai, books, clock })

    const events = await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', model: 'claude-sonnet-4-6' }, send))

    expect(events.filter(e => e.type === 'toc').length).toBeGreaterThan(0)
    const done = events.find(e => e.type === 'done')
    expect(done).toEqual({ type: 'done', bookId: 'book-1', title: 'Resilient CSS', totalChapters: 2 })

    const meta = await books.getBook('book-1')
    expect(meta.status).toBe('toc_review')
    expect(meta.title).toBe('Resilient CSS')
    expect(meta.subtitle).toBe('Layout Systems for the Real World')
    expect(meta.totalChapters).toBe(2)

    const toc = await books.getToc('book-1')
    expect(toc.chapters).toHaveLength(2)
    expect(toc.chapters[0].title).toBe('The Box Model Revisited')
  })

  it('includes the topic, details, and profile context in the TOC prompt', async () => {
    const { ai, books, clock } = makeDeps()
    await books.saveProfile({
      identity: 'Frontend developer', style: '',
      preferences: {
        explainComplexTermsSimply: true, codeExamples: true, realWorldAnalogies: true,
        includeRecaps: true, includeSummaries: true, visualDescriptions: false,
        depthLevel: 3, pacePreference: 3, metaphorDensity: 3, narrativeStyle: 3, humorLevel: 2, formalityLevel: 3,
      },
      skills: [],
    })
    ai.scriptStreamText([TOC_MARKDOWN])
    const createBook = createCreateBook({ ai, books, clock })

    await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', details: 'Focus on Grid', model: 'claude-sonnet-4-6' }, send))

    const req = ai.requests.streamText[0]
    expect(req.prompt).toContain('Create a table of contents for a book about: CSS Layout')
    expect(req.prompt).toContain('Additional context: Focus on Grid')
    expect(req.system).toContain('Reader background: Frontend developer')
  })

  it('sends an error event and leaves the book as generating_toc when the TOC fails to parse', async () => {
    const { ai, books, clock } = makeDeps()
    ai.scriptStreamText(['not a valid toc at all'])
    const createBook = createCreateBook({ ai, books, clock })

    const events = await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', model: 'claude-sonnet-4-6' }, send))

    const error = events.find(e => e.type === 'error')
    expect(error).toMatchObject({ type: 'error' })
    expect((error as { message: string }).message).toContain('Failed to parse table of contents')
    expect(events.some(e => e.type === 'done')).toBe(false)

    const meta = await books.getBook('book-1')
    expect(meta.status).toBe('generating_toc')
  })

  it('marks the book failed and reports the thrown message when generation throws', async () => {
    const { books, clock } = makeDeps()
    const ai = createFakeTextGeneration()
    ai.streamText = () => { throw new Error('model unavailable') }
    const createBook = createCreateBook({ ai, books, clock })

    const events = await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', model: 'claude-sonnet-4-6' }, send))

    expect(events).toContainEqual({ type: 'error', message: 'model unavailable' })
    const meta = await books.getBook('book-1')
    expect(meta.status).toBe('failed')
  })

  it('uses the given chapterCount instead of the default', async () => {
    const { ai, books, clock } = makeDeps()
    ai.scriptStreamText([TOC_MARKDOWN])
    const createBook = createCreateBook({ ai, books, clock })

    const events = await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', model: 'claude-sonnet-4-6', chapterCount: 5 }, send))

    expect(events[0]).toMatchObject({ totalChapters: 5 })
    expect(ai.requests.streamText[0].system).toContain('exactly 5 chapters')
  })

  it('stamps createdAt/updatedAt from the clock', async () => {
    const { ai, books, clock } = makeDeps()
    ai.scriptStreamText([TOC_MARKDOWN])
    const createBook = createCreateBook({ ai, books, clock })

    await collectEvents((send) => createBook('book-1', { topic: 'CSS Layout', model: 'claude-sonnet-4-6' }, send))

    const meta = await books.getBook('book-1')
    expect(meta.createdAt).toBe(clock.nowIso())
  })
})
