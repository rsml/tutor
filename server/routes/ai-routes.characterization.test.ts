import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestServer } from '../test/route-harness.js'

// Characterization tests for the routes that call an AI provider — validation
// and error paths ONLY. server/test/setup-env.ts strips every provider API
// key before any module loads, so these routes can never make a live network
// call in this suite. Only requests that terminate on their own (a 400 from
// body validation, or the synchronous "no API key" failure) are safe to
// inject — see route-harness.ts and the risks noted in the task spec for why
// generation routes are otherwise off-limits here.
//
// POST /api/books is rate limited to 5/min per Fastify instance; this file
// calls it twice total, well under that limit, and a fresh instance is
// built per test regardless (see beforeEach below).

describe('AI-touching routes (characterization): validation and error paths only', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestServer()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/books', () => {
    it('rejects an empty body with 400 before any streaming starts', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/books', payload: {} })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: 'Invalid request' })
    })

    // This is the proof that a valid create-book request never reaches the
    // network when no API key is configured: the SSE stream still opens
    // (200), but the only events are book_created followed immediately by a
    // same-process "no API key" error from model-client.ts (thrown while
    // building the model client, before streamText ever issues a request),
    // and the book is left in a 'failed' status rather than any
    // in-progress one.
    it('opens the SSE stream but fails synchronously with "no API key", never reaching the network', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/books',
        payload: { model: 'claude-sonnet-4-6', topic: 'Characterization Testing' },
      })
      expect(res.statusCode).toBe(200)

      const events = res.payload
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => JSON.parse(chunk.slice('data: '.length)))

      const last = events[events.length - 1]
      expect(last).toEqual({ type: 'error', message: 'No API key configured for provider: anthropic' })

      const listRes = await app.inject({ method: 'GET', url: '/api/books' })
      const books = listRes.json()
      expect(books).toHaveLength(1)
      expect(books[0].status).toBe('failed')
    })
  })

  describe('POST /api/books/:id/generate-next', () => {
    it('rejects an empty body with 400 before touching the book', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/books/any-book/generate-next', payload: {} })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: 'Invalid request' })
    })
  })

  describe('POST /api/books/:id/toc/revise', () => {
    it('rejects an empty body with 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/books/any-book/toc/revise', payload: {} })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: 'Invalid request' })
    })
  })

  describe('POST /api/books/:id/final-quiz', () => {
    it('rejects an empty body with 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/books/any-book/final-quiz', payload: {} })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: 'Invalid request' })
    })
  })

  describe('GET /api/providers/:provider/models', () => {
    it('returns 400 when no API key is configured', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/providers/anthropic/models' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'No API key configured for anthropic' })
    })
  })
})
