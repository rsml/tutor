import { describe, expect, it, vi } from 'vitest'
import type { BookMeta, Toc } from '@shared/domain.js'
import type { ReviseTocEvent } from '@shared/events.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { createReviseToc } from './revise-toc.js'

const BOOK: BookMeta = {
  id: 'book-1',
  title: 'Resilient CSS',
  subtitle: 'Layout Systems for the Real World',
  prompt: 'CSS layout',
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

async function collectEvents(fn: (send: (e: ReviseTocEvent) => void) => Promise<void>): Promise<ReviseTocEvent[]> {
  const events: ReviseTocEvent[] = []
  await fn((e) => events.push(e))
  return events
}

describe('createReviseToc', () => {
  it('streams the revised TOC, saves it, and reports the final title/subtitle/count', async () => {
    const { ai, books, clock } = makeDeps()
    await books.saveBook(BOOK)
    await books.saveToc(BOOK.id, TOC)
    ai.scriptStreamText([
      '# Resilient CSS\n*Layout Systems for the Real World*\n\n',
      '1. **The Box Model Revisited** — Understanding the foundation.\n',
      '2. **Grid Layout** — Two-dimensional layout.',
    ])
    const reviseToc = createReviseToc({ ai, books, clock })

    const events = await collectEvents((send) => reviseToc(BOOK.id, structuredClone(BOOK), TOC, { feedback: 'Swap flexbox for grid', model: 'claude-sonnet-4-6' }, send))

    expect(events.filter(e => e.type === 'toc').length).toBeGreaterThan(0)
    expect(events.at(-1)).toEqual({
      type: 'toc_revised', bookId: BOOK.id, title: 'Resilient CSS', subtitle: 'Layout Systems for the Real World', totalChapters: 2,
    })

    const toc = await books.getToc(BOOK.id)
    expect(toc.chapters.map(c => c.title)).toEqual(['The Box Model Revisited', 'Grid Layout'])
  })

  it('includes the existing TOC and sanitized feedback in the prompt', async () => {
    const { ai, books, clock } = makeDeps()
    await books.saveBook(BOOK)
    await books.saveToc(BOOK.id, TOC)
    ai.scriptStreamText(['# Resilient CSS\n*Layout Systems for the Real World*\n\n1. **The Box Model Revisited** — Understanding the foundation.\n2. **Flexbox Deep Dive** — Layout patterns.'])
    const reviseToc = createReviseToc({ ai, books, clock })

    await collectEvents((send) => reviseToc(BOOK.id, structuredClone(BOOK), TOC, { feedback: 'add more <b>bold</b> examples', model: 'claude-sonnet-4-6' }, send))

    const req = ai.requests.streamText[0]
    expect(req.prompt).toContain('1. **The Box Model Revisited** — Understanding the foundation.')
    expect(req.prompt).toContain('add more bold examples')
    expect(req.prompt).not.toContain('<b>')
  })

  it('updates title and subtitle only when the AI returns different ones', async () => {
    const { ai, books, clock } = makeDeps()
    const book = structuredClone(BOOK)
    await books.saveBook(book)
    await books.saveToc(BOOK.id, TOC)
    ai.scriptStreamText(['# New Title\n*New Subtitle*\n\n1. **A** — a.\n2. **B** — b.'])
    const reviseToc = createReviseToc({ ai, books, clock })

    const events = await collectEvents((send) => reviseToc(BOOK.id, structuredClone(book), TOC, { feedback: 'rename', model: 'claude-sonnet-4-6' }, send))

    expect(events.at(-1)).toMatchObject({ title: 'New Title', subtitle: 'New Subtitle' })
    const meta = await books.getBook(BOOK.id)
    expect(meta.title).toBe('New Title')
    expect(meta.subtitle).toBe('New Subtitle')
    expect(meta.updatedAt).toBe(clock.nowIso())
  })

  it('does not write the book back when nothing about it changed', async () => {
    const { ai, books, clock } = makeDeps()
    await books.saveBook(BOOK)
    await books.saveToc(BOOK.id, TOC)
    const saveBookSpy = vi.spyOn(books, 'saveBook')
    ai.scriptStreamText(['# Resilient CSS\n*Layout Systems for the Real World*\n\n1. **The Box Model Revisited** — Understanding the foundation.\n2. **Flexbox Deep Dive** — Layout patterns.'])
    const reviseToc = createReviseToc({ ai, books, clock })

    await collectEvents((send) => reviseToc(BOOK.id, structuredClone(BOOK), TOC, { feedback: 'no real change', model: 'claude-sonnet-4-6' }, send))

    expect(saveBookSpy).not.toHaveBeenCalled()
  })

  it('sends an error event and does not save when the revised TOC fails to parse', async () => {
    const { ai, books, clock } = makeDeps()
    await books.saveBook(BOOK)
    await books.saveToc(BOOK.id, TOC)
    const saveTocSpy = vi.spyOn(books, 'saveToc')
    ai.scriptStreamText(['not a toc'])
    const reviseToc = createReviseToc({ ai, books, clock })

    const events = await collectEvents((send) => reviseToc(BOOK.id, structuredClone(BOOK), TOC, { feedback: 'x', model: 'claude-sonnet-4-6' }, send))

    expect(events).toContainEqual({ type: 'error', message: "Couldn't parse the revised TOC — try rephrasing your feedback." })
    expect(saveTocSpy).not.toHaveBeenCalled()
  })

  it('reports the thrown error message and never marks the book failed', async () => {
    const { books, clock } = makeDeps()
    await books.saveBook(BOOK)
    await books.saveToc(BOOK.id, TOC)
    const ai = createFakeTextGeneration()
    ai.streamText = () => { throw new Error('provider down') }
    const reviseToc = createReviseToc({ ai, books, clock })

    const events = await collectEvents((send) => reviseToc(BOOK.id, structuredClone(BOOK), TOC, { feedback: 'x', model: 'claude-sonnet-4-6' }, send))

    expect(events).toEqual([{ type: 'error', message: 'provider down' }])
    const meta = await books.getBook(BOOK.id)
    expect(meta.status).toBe('toc_review')
  })
})
