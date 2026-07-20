import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestServer } from '../test/route-harness.js'

// Characterization tests for server/routes/audiobook.ts — the top-level
// audiobook engine routes (install status, voice catalogue, voice preview).
// These assert what the routes do TODAY, including quirks.

describe('audiobook engine routes (characterization)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestServer()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/audiobook/status', () => {
    it('reports the engine as not installed in a fresh test data dir', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/audiobook/status' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      // Not environment-dependent: both the kokoro model and ffmpeg are
      // looked up relative to TUTOR_DATA_DIR (server/services/kokoro-service.ts
      // and audiobook-installer.ts), which setup-env.ts always points at a
      // brand-new, empty temp directory for this test file, never the real
      // user data dir or the system PATH. So this is deterministically false
      // regardless of what's installed on the machine running the suite.
      expect(body).toEqual({
        installed: false,
        missing: { model: true, ffmpeg: true },
        downloadSize: expect.any(Number),
      })
    })
  })

  describe('GET /api/audiobook/voices', () => {
    it('returns a non-empty voice catalogue', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/audiobook/voices' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(Array.isArray(body.voices)).toBe(true)
      expect(body.voices.length).toBeGreaterThan(0)
      expect(Object.keys(body.voices[0]).sort()).toEqual(['gender', 'grade', 'id', 'language', 'name'])
    })
  })

  describe('GET /api/audiobook/voices/:voiceId/preview', () => {
    // DEVIATION from the task spec's table: the spec expected 400 (param
    // pattern) for "zzz". In reality "zzz" satisfies the voiceId pattern
    // ^[a-z_]{2,32}$ (any 2-32 lowercase letters/underscores, not
    // specifically the am_/af_/bm_/bf_ prefix shape real voice ids use), so
    // it passes schema validation and reaches the handler, which does its
    // own voices.some(...) lookup and 404s there instead. Recorded as-is.
    it('returns 404 Unknown voice for a syntactically valid but nonexistent voiceId', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/audiobook/voices/zzz/preview' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'Unknown voice' })
    })

    it('returns 400 via the AJV pattern shape for a voiceId that violates the pattern', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/audiobook/voices/1/preview' })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('FST_ERR_VALIDATION')
    })

    it('returns 409 needsInstall for a known voice when the engine is not installed', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/audiobook/voices/am_michael/preview' })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toEqual({ error: 'Audiobook engine not installed', needsInstall: true })
    })
  })
})
