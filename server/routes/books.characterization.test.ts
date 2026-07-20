import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestServer, seedBook } from '../test/route-harness.js'
import * as store from '../services/book-store.js'

// Characterization tests for server/routes/books.ts — the happy-path CRUD,
// TOC, chapter, progress, feedback, quiz, and rating routes. These assert
// what the routes do TODAY, including quirks, not what they should do.
// Status codes and response shapes (keys) are asserted; AI-generated prose
// is never asserted here (these routes don't generate any in the paths
// under test — see ai-routes.characterization.test.ts for the AI paths).
//
// FROZEN QUIRK — confirmed with a real listening server + real HTTP fetch,
// not just fastify.inject: buildServer() in server/index.ts calls
// fastify.setErrorHandler(...) AFTER every route plugin has already been
// awaited through fastify.register(...). Because each register() call fully
// resolves before the next line runs, every route inside those plugins
// (this includes all nine registered plugins, not just bookRoutes) boots
// against Fastify's OWN default error handler, never the app's custom one.
// Concretely, for any error that isn't caught and hand-formatted inside the
// route handler itself:
//   - An uncaught ENOENT (e.g. store.getBook on a missing book) returns 500
//     with Fastify's generic shape, not the intended 404 { error: 'Not
//     found' }. "Not found" is not reachable today for this class of error.
//   - AJV param-schema violations (id/num pattern mismatches) return
//     Fastify's own validation-error shape, not a reformatted one.
//   - A manually-thrown Error with only `.statusCode` set (no `.code`), like
//     validateChapterNum's out-of-range error, still lands on the right
//     status code (Fastify's default handler also reads `.statusCode`), but
//     in Fastify's own shape rather than the custom { error: message } one.
// This is not something this chain's spec is allowed to fix — S1 only
// permits extracting buildServer() verbatim, and this ordering was already
// present in the pre-extraction startServer(). It is recorded here as-is.

describe('books routes (characterization)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestServer()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/books', () => {
    it('returns an empty array when no books exist', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/books' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('augments a seeded book with cover, progress, and audiobook flags', async () => {
      await seedBook()
      const res = await app.inject({ method: 'GET', url: '/api/books' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveLength(1)
      expect(Object.keys(body[0])).toEqual(
        expect.arrayContaining(['hasCover', 'showTitleOnCover', 'coverUpdatedAt', 'chaptersRead', 'hasAudiobook']),
      )
    })
  })

  describe('GET /api/books/:id', () => {
    it('returns meta plus a generation status for a seeded book', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(meta.id)
      expect(body.generation).toEqual({ active: false })
    })

    it('returns 500 (not the intended 404) for an unknown id — see FROZEN QUIRK above', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/books/does-not-exist' })
      expect(res.statusCode).toBe(500)
      const body = res.json()
      expect(body.code).toBe('ENOENT')
      expect(Object.keys(body).sort()).toEqual(['code', 'error', 'message', 'statusCode'])
    })

    it('returns 400 via Fastify\'s own validation shape for an id that violates the id pattern', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/books/UPPERCASE' })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.code).toBe('FST_ERR_VALIDATION')
      expect(Object.keys(body).sort()).toEqual(['code', 'error', 'message', 'statusCode'])
    })
  })

  describe('PATCH /api/books/:id', () => {
    it('updates the title and lowercases/hyphenates tags', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/books/${meta.id}`,
        payload: { title: 'New Title', tags: ['Deep Learning', 'AI Basics'] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      const body = getRes.json()
      expect(body.title).toBe('New Title')
      expect(body.tags).toEqual(['deep-learning', 'ai-basics'])
    })

    it('returns 400 with details for an invalid body', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'PATCH', url: `/api/books/${meta.id}`, payload: { title: '' } })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error).toBe('Invalid request')
      expect(body).toHaveProperty('details')
    })
  })

  describe('DELETE /api/books/:id', () => {
    it('deletes the book; a follow-up GET hits the same 500 ENOENT quirk as an unknown id', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'DELETE', url: `/api/books/${meta.id}` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.statusCode).toBe(500)
      expect(getRes.json().code).toBe('ENOENT')
    })
  })

  describe('POST /api/books/:id/reset', () => {
    it('resets a reading book', async () => {
      const meta = await seedBook({ status: 'reading' })
      const res = await app.inject({ method: 'POST', url: `/api/books/${meta.id}/reset` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
    })

    it('refuses to reset a generating book with 409', async () => {
      const meta = await seedBook({ status: 'generating' })
      const res = await app.inject({ method: 'POST', url: `/api/books/${meta.id}/reset` })
      expect(res.statusCode).toBe(409)
    })
  })

  describe('GET /api/books/:id/toc', () => {
    it('returns the seeded chapters', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/toc` })
      expect(res.statusCode).toBe(200)
      expect(res.json().chapters).toHaveLength(2)
    })
  })

  describe('PUT /api/books/:id/toc', () => {
    it('replaces the toc and updates totalChapters', async () => {
      const meta = await seedBook({ totalChapters: 5, generatedUpTo: 1 })
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

  describe('GET /api/books/:id/chapters/:num', () => {
    it('returns the seeded chapter content', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/1` })
      expect(res.statusCode).toBe(200)
      expect(typeof res.json().content).toBe('string')
    })

    it('returns 400 when the chapter number exceeds totalChapters, via the same non-custom shape (statusCode + message, no code)', async () => {
      const meta = await seedBook({ totalChapters: 2, generatedUpTo: 1 })
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/5` })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.message).toContain('Chapter 5 out of range')
      expect(Object.keys(body).sort()).toEqual(['error', 'message', 'statusCode'])
    })

    it('returns 400 via the AJV pattern shape for a non-numeric chapter param', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/abc` })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('FST_ERR_VALIDATION')
    })

    it('returns 400 via the AJV pattern shape for chapter 0', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/0` })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('FST_ERR_VALIDATION')
    })
  })

  describe('GET /api/books/:id/generation-status', () => {
    it('reports inactive for an idle book', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/generation-status` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ active: false })
    })
  })

  describe('PUT /api/books/:id/progress/:num', () => {
    it('accepts a valid progress body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/progress/1`,
        payload: { scroll: 0.5, completed: false },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
    })

    it('returns 400 with details for an invalid progress body', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/progress/1`,
        payload: { scroll: 'not-a-number' },
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error).toBe('Invalid request')
      expect(body).toHaveProperty('details')
    })
  })

  describe('POST /api/books/:id/chapters/:num/feedback', () => {
    it('computes quiz.score from quizAnswers against a seeded quiz', async () => {
      const meta = await seedBook()
      await store.saveQuiz(meta.id, 1, {
        questions: [
          { question: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
          { question: 'Q2?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 },
        ],
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/books/${meta.id}/chapters/1/feedback`,
        payload: { liked: 'the intro', quizAnswers: [0, 2] }, // Q1 correct, Q2 wrong
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const feedbackRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/feedback` })
      const feedback = feedbackRes.json().feedback
      expect(feedback).toHaveLength(1)
      expect(feedback[0].quiz.score).toBe(1)
      expect(feedback[0].quiz.questions).toHaveLength(2)
    })

    it('stores empty questions when no quiz exists for the chapter', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'POST',
        url: `/api/books/${meta.id}/chapters/1/feedback`,
        payload: { liked: 'nice' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const feedbackRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/feedback` })
      expect(feedbackRes.json().feedback[0].quiz.questions).toEqual([])
    })
  })

  describe('GET /api/books/:id/chapters/:num/quiz', () => {
    it('returns a seeded quiz verbatim without generating one', async () => {
      const meta = await seedBook()
      const quiz = { questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 2 }] }
      await store.saveQuiz(meta.id, 1, quiz)

      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/1/quiz` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual(quiz)
    })
  })

  describe('PUT /api/books/:id/rating', () => {
    it('sets a rating', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'PUT', url: `/api/books/${meta.id}/rating`, payload: { rating: 4 } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.json().rating).toBe(4)
    })

    it('deletes the rating field when rating is 0', async () => {
      const meta = await seedBook({ rating: 4 })
      const res = await app.inject({ method: 'PUT', url: `/api/books/${meta.id}/rating`, payload: { rating: 0 } })
      expect(res.statusCode).toBe(200)

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.json()).not.toHaveProperty('rating')
    })

    it('marks the book complete when a finalQuizScore is submitted', async () => {
      const meta = await seedBook()
      const res = await app.inject({
        method: 'PUT',
        url: `/api/books/${meta.id}/rating`,
        payload: { rating: 5, finalQuizScore: 8, finalQuizTotal: 10 },
      })
      expect(res.statusCode).toBe(200)

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.json().status).toBe('complete')
    })
  })
})
