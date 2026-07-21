import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestServer, seedBook } from '../test/route-harness.js'

// Characterization tests for server/routes/authoring.ts, the eight MCP
// authoring routes that parse a request body:
//   POST   /api/books/create-skeleton
//   PUT    /api/books/:id/chapters/:num/content
//   PATCH  /api/books/:id/meta
//   PUT    /api/books/:id/brief
//   PUT    /api/books/:id/summaries/:num
//   PUT    /api/books/:id/toc
//   PUT    /api/books/:id/references/:name
//   PUT    /api/books/:id/quiz/:num
//
// RECORDS A DELIBERATE, SANCTIONED PHASE 2 CHANGE: these eight routes used
// to call Schema.parse(request.body) with no try/catch, so a malformed body
// surfaced as an uncaught ZodError, which the (formerly dead, see
// books.characterization.test.ts) error handler had no special case for and
// which therefore 500'd. Phase 2 routes every one of them through
// parseBody() from server/http/parse.ts instead, which throws
// RequestValidationError, a type the error handler does have a case for, so
// a malformed body on any of these eight now returns 400 with
// { error: 'Invalid request', details: [...] } instead of a 500. This suite
// had zero coverage before Phase 2; every test below is new.
//
// Each route gets one test proving the malformed-body 400 and one proving a
// well-formed body still succeeds exactly as it always has.

describe('authoring routes (characterization)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestServer()
  })

  afterEach(async () => {
    await app.close()
  })

  function expectInvalidRequest(res: { statusCode: number; json: () => unknown }) {
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; details: unknown }
    expect(body.error).toBe('Invalid request')
    expect(body).toHaveProperty('details')
  }

  describe('POST /api/books/create-skeleton', () => {
    it('returns 400 for a malformed body', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/books/create-skeleton', payload: { title: '' } })
      expectInvalidRequest(res)
    })

    it('creates a book skeleton for a well-formed body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/books/create-skeleton',
        payload: { title: 'New Book', prompt: 'Learn things', totalChapters: 5 },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.title).toBe('New Book')
      expect(body.bookId).toHaveLength(12)

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${body.bookId}` })
      expect(getRes.json().status).toBe('generating')
      expect(getRes.json().totalChapters).toBe(5)
    })
  })

  describe('PUT /api/books/:id/chapters/:num/content', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/chapters/1/content`,
        payload: {},
      })
      expectInvalidRequest(res)
    })

    it('saves the chapter content for a well-formed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/chapters/1/content`,
        payload: { content: '# Rewritten chapter' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/1` })
      expect(getRes.json().content).toBe('# Rewritten chapter')
    })
  })

  describe('PATCH /api/books/:id/meta', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/books/${meta.id}/meta`,
        payload: { status: 'not-a-real-status' },
      })
      expectInvalidRequest(res)
    })

    it('updates meta fields for a well-formed body', async () => {
      const meta = await seedBook({ generatedUpTo: 1 })
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/books/${meta.id}/meta`,
        payload: { generatedUpTo: 2 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.json().generatedUpTo).toBe(2)
    })
  })

  describe('PUT /api/books/:id/brief', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'PUT', url: `/api/books/${meta.id}/brief`, payload: {} })
      expectInvalidRequest(res)
    })

    it('saves the brief for a well-formed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/brief`,
        payload: { content: 'The brief this book was generated from.' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/brief` })
      expect(getRes.json().content).toBe('The brief this book was generated from.')
    })
  })

  describe('PUT /api/books/:id/summaries/:num', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/summaries/1`,
        payload: { summary: '' },
      })
      expectInvalidRequest(res)
    })

    it('saves the summary for a well-formed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/summaries/1`,
        payload: { summary: 'A short summary.', keyPoints: ['point one', 'point two'] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/summaries` })
      expect(getRes.json().summaries).toEqual([{ summary: 'A short summary.', keyPoints: ['point one', 'point two'] }])
    })
  })

  describe('PUT /api/books/:id/toc', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/toc`,
        payload: { chapters: 'not-an-array' },
      })
      expectInvalidRequest(res)
    })

    it('saves the toc and updates totalChapters for a well-formed body', async () => {
      const meta = await seedBook({ totalChapters: 5 })
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/toc`,
        payload: { chapters: [{ title: 'A', description: 'a' }, { title: 'B', description: 'b' }] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.json().totalChapters).toBe(2)
    })
  })

  describe('PUT /api/books/:id/references/:name', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/references/source-a`,
        payload: {},
      })
      expectInvalidRequest(res)
    })

    it('saves the reference for a well-formed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/references/source-a`,
        payload: { content: 'Reference material.' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/references/source-a` })
      expect(getRes.json().content).toBe('Reference material.')
    })
  })

  describe('PUT /api/books/:id/quiz/:num', () => {
    it('returns 400 for a malformed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/quiz/1`,
        // options must have exactly 4 entries
        payload: { questions: [{ question: 'Q?', options: ['a', 'b'], correctIndex: 0 }] },
      })
      expectInvalidRequest(res)
    })

    it('saves the quiz for a well-formed body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/quiz/1`,
        payload: { questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/1/quiz` })
      expect(getRes.json()).toEqual({ questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }] })
    })
  })
})
