import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createTestServer, seedBook } from '../test/route-harness.js'
import { getDataDir } from '@shared/node/data-dir.js'
import { createFsArtifactStore } from '../adapters/fs-artifact-store.js'

// Characterization tests for server/routes/audiobook-generation.ts.
//
// THE 206 RANGE RESPONSE IS A PHASE GATE for this route file: it serves HTTP
// Range requests for the audiobook M4B (and, via resolveChapterAudioFile,
// legacy per-chapter MP3s) and must keep returning 206 Partial Content with
// correct Content-Range and Accept-Ranges headers. No test exercised this
// route directly before this file; the assertions below prove it.

describe('audiobook generation routes (characterization)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestServer()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/books/:id/audiobook/file', () => {
    it('returns 206 Partial Content with Content-Range, Accept-Ranges, and the exact requested byte slice for a Range request', async () => {
      const meta = await seedBook()
      const audiobookPath = createFsArtifactStore({ dataDir: getDataDir() }).audiobookPath(meta.id)
      await mkdir(dirname(audiobookPath), { recursive: true })
      const fakeAudio = Buffer.alloc(1000)
      for (let i = 0; i < fakeAudio.length; i++) fakeAudio[i] = i % 256
      await writeFile(audiobookPath, fakeAudio)

      const res = await app.inject({
        method: 'GET',
        url: `/api/books/${meta.id}/audiobook/file`,
        headers: { range: 'bytes=0-99' },
      })

      expect(res.statusCode).toBe(206)
      expect(res.headers['content-range']).toBe('bytes 0-99/1000')
      expect(res.headers['accept-ranges']).toBe('bytes')
      expect(res.headers['content-length']).toBe('100')
      expect(res.rawPayload.length).toBe(100)
      expect(res.rawPayload.equals(fakeAudio.subarray(0, 100))).toBe(true)
    })

    it('returns 200 with the full body and Accept-Ranges when no Range header is sent', async () => {
      const meta = await seedBook()
      const audiobookPath = createFsArtifactStore({ dataDir: getDataDir() }).audiobookPath(meta.id)
      await mkdir(dirname(audiobookPath), { recursive: true })
      const fakeAudio = Buffer.alloc(500, 3)
      await writeFile(audiobookPath, fakeAudio)

      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/audiobook/file` })

      expect(res.statusCode).toBe(200)
      expect(res.headers['accept-ranges']).toBe('bytes')
      expect(res.rawPayload.length).toBe(500)
    })

    it('returns 404 when no audiobook has been generated', async () => {
      const meta = await seedBook()

      const res = await app.inject({ method: 'GET', url: `/api/books/${meta.id}/audiobook/file` })

      expect(res.statusCode).toBe(404)
    })
  })
})
