import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestServer } from '../test/route-harness.js'

// Characterization tests for server/routes/import.ts — EPUB import preview.
// import.ts hand-catches ZodError and generic Error itself (see the route),
// so these responses are unaffected by the setErrorHandler quirk documented
// in books.characterization.test.ts.

describe('import routes (characterization)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestServer()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/books/import/preview', () => {
    it('rejects an empty body with 400 Invalid request', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/books/import/preview', payload: {} })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error).toBe('Invalid request')
      expect(body).toHaveProperty('details')
    })

    // DEVIATION from the task spec's literal request body: the spec's
    // {base64:'bm90YW56aXA='} body omits the required `filename` field
    // (ImportEpubBodySchema requires both base64 and filename), so sending
    // it as-is would just repeat the "Invalid request" case above rather
    // than exercising the EPUB-parsing failure path the spec describes.
    // filename is added here so the request clears body validation and
    // actually reaches previewEpub(), which is what "not an EPUB -> 400
    // with an error string" is characterizing.
    it('rejects non-EPUB content that passes body validation, with a plain error string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/books/import/preview',
        payload: { base64: 'bm90YW56aXA=', filename: 'test.epub' },
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(typeof body.error).toBe('string')
      expect(Object.keys(body)).toEqual(['error'])
    })
  })
})
