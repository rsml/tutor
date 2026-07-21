import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestServer, seedBook } from '../test/route-harness.js'
import { getDataDir } from '@shared/node/data-dir.js'
import { createFsBookRepository } from '../adapters/fs-book-repository.js'

// Characterization tests for server/routes/books.ts — the happy-path CRUD,
// TOC, chapter, progress, feedback, quiz, and rating routes. These assert
// what the routes do TODAY, including quirks, not what they should do.
// Status codes and response shapes (keys) are asserted; AI-generated prose
// is never asserted here (these routes don't generate any in the paths
// under test — see ai-routes.characterization.test.ts for the AI paths).
//
// FROZEN QUIRK — confirmed with a real listening server + real HTTP fetch,
// RESOLVED IN PHASE 2 — this note is kept because it explains why several
// assertions below carry a "CHANGED IN PHASE 2" comment.
//
// Phase 0 recorded a real defect here: buildServer() called
// fastify.setErrorHandler(...) AFTER every route plugin had already been
// awaited through fastify.register(...). Fastify only propagates an error
// handler to encapsulation contexts created after it is set, so every route
// in all nine plugins booted against Fastify's OWN default handler and the
// app's handler never ran. Phase 0 froze that broken behaviour deliberately,
// since its remit was to extract buildServer() verbatim, not to fix it.
//
// Phase 2 moved the registration ahead of the route plugins, which was the
// sanctioned fix. The behaviours that changed, all recorded individually
// below, are:
//   - An uncaught ENOENT now returns 404 { error: 'Not found' } instead of a
//     500 whose message contained an absolute filesystem path.
//   - AJV param violations and manually-thrown errors carrying only
//     `.statusCode` keep their status code but now render in the app's
//     { error } shape rather than Fastify's { statusCode, code, error,
//     message }. That shape is what client/lib/api.ts already reads.

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

    // CHANGED IN PHASE 2, sanctioned. Was 500 with Fastify's generic shape and
    // an absolute filesystem path in `message`. The error handler is now
    // registered before the route plugins, so ENOENT reaches it and 404s.
    it('returns 404 for an unknown id, without leaking a filesystem path', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/books/does-not-exist' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'Not found' })
      expect(res.body).not.toContain('/Users/')
    })

    // CHANGED IN PHASE 2, sanctioned. Status is still 400. Only the body shape
    // moved, from Fastify's raw `{statusCode, code, error, message}` to the
    // app's own `{error}` convention, which is what client/lib/api.ts reads.
    it('returns 400 in the app error shape for an id that violates the id pattern', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/books/UPPERCASE' })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(Object.keys(body)).toEqual(['error'])
      expect(body.error).toContain('params/id')
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
    // CHANGED IN PHASE 2, sanctioned. The follow-up GET now 404s like any
    // other missing book, rather than 500ing through the ENOENT quirk.
    it('deletes the book; a follow-up GET now returns a clean 404', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'DELETE', url: `/api/books/${meta.id}` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const getRes = await app.inject({ method: 'GET', url: `/api/books/${meta.id}` })
      expect(getRes.statusCode).toBe(404)
      expect(getRes.json()).toEqual({ error: 'Not found' })
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

    // CHANGED IN PHASE 2, sanctioned. Status and message text are unchanged.
    // The thrown error carries only `.statusCode`, so it now renders through
    // the app's `{error: message}` shape instead of Fastify's default one.
    it('returns 400 in the app error shape when the chapter number exceeds totalChapters', async () => {
      const meta = await seedBook({ totalChapters: 2, generatedUpTo: 1 })
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/5` })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(Object.keys(body)).toEqual(['error'])
      expect(body.error).toContain('Chapter 5 out of range')
    })

    // CHANGED IN PHASE 2, sanctioned. Still 400, now in the app error shape.
    it('returns 400 in the app error shape for a non-numeric chapter param', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/abc` })
      expect(res.statusCode).toBe(400)
      expect(Object.keys(res.json())).toEqual(['error'])
    })

    // CHANGED IN PHASE 2, sanctioned. Still 400, now in the app error shape.
    it('returns 400 in the app error shape for chapter 0', async () => {
      const meta = await seedBook()
      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/chapters/0` })
      expect(res.statusCode).toBe(400)
      expect(Object.keys(res.json())).toEqual(['error'])
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
      await createFsBookRepository({ dataDir: getDataDir() }).saveQuiz(meta.id, 1, {
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
      await createFsBookRepository({ dataDir: getDataDir() }).saveQuiz(meta.id, 1, quiz)

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
