import type { FastifyInstance } from 'fastify'
import { VOICE_PREVIEW_CACHE_MAX_AGE_S } from '../constants.js'
import { STATUS_NOT_FOUND, STATUS_CONFLICT } from '../http/status.js'
import type { Ports, SharedServices } from '../composition-root.js'

// Top-level audiobook engine routes (not scoped to a specific book).
//
// Per-book audiobook routes live in routes/audiobook-generation.ts — two
// files, two concerns.
export async function audiobookRoutes(fastify: FastifyInstance, opts: { ports: Ports; services: SharedServices }) {
  const { ports } = opts

  // GET /api/audiobook/status — engine install state
  fastify.get('/api/audiobook/status', async () => {
    const missing = ports.speechSynthesis.missingComponents()
    return {
      installed: ports.speechSynthesis.isInstalled(),
      missing: { model: missing.model, ffmpeg: missing.ffmpeg },
      downloadSize: missing.totalBytes,
    }
  })

  // POST /api/audiobook/install — kick off Kokoro + ffmpeg download
  fastify.post<{ Body: unknown }>('/api/audiobook/install', async (request, reply) => {
    const body = (request.body ?? {}) as { force?: boolean }
    const alreadyInstalled = ports.speechSynthesis.isInstalled()
    if (alreadyInstalled && !body.force) {
      return reply.status(STATUS_CONFLICT).send({ error: 'Audiobook engine already installed' })
    }

    // System-wide install — bookId='_engine' is a synthetic key so the task
    // shows up in the global tasks list without colliding with any real book id.
    if (ports.backgroundTasks.findActive('_engine', 'install-audiobook')) {
      return reply.status(STATUS_CONFLICT).send({ error: 'Audiobook install already in progress' })
    }

    const missing = ports.speechSynthesis.missingComponents()
    const totalBytes = missing.totalBytes || 1 // avoid div-by-zero if already installed + force

    // total=100 so progress reports as a percentage; the label carries the
    // human-readable MB/MB string from the installer.
    const handle = ports.backgroundTasks.start({
      type: 'install-audiobook',
      bookId: '_engine',
      bookTitle: 'Audiobook narration',
      total: 100,
    })

    ;(async () => {
      try {
        await ports.speechSynthesis.install((progress) => {
          if (handle.signal.aborted) return
          const pct = Math.max(0, Math.min(100, Math.floor((progress.bytesDownloaded / totalBytes) * 100)))
          ports.backgroundTasks.report(handle.id, pct, progress.label)
        }, handle.signal)

        ports.backgroundTasks.succeed(handle.id)
      } catch (err) {
        if (handle.signal.aborted) return
        const msg = err instanceof Error ? err.message : 'Audiobook install failed'
        ports.backgroundTasks.fail(handle.id, msg)
      }
    })()

    return { taskId: handle.id }
  })

  // GET /api/audiobook/voices — list available voices for the picker
  fastify.get('/api/audiobook/voices', async () => {
    return { voices: ports.speechSynthesis.listVoices() }
  })

  // GET /api/audiobook/voices/:voiceId/preview — 5s WAV sample for the voice
  fastify.get<{ Params: { voiceId: string } }>(
    '/api/audiobook/voices/:voiceId/preview',
    {
      schema: {
        params: {
          type: 'object' as const,
          properties: { voiceId: { type: 'string' as const, pattern: '^[a-z_]{2,32}$' } },
          required: ['voiceId'] as const,
        },
      },
    },
    async (request, reply) => {
      const { voiceId } = request.params
      const voices = ports.speechSynthesis.listVoices()
      if (!voices.some((v) => v.id === voiceId)) {
        return reply.status(STATUS_NOT_FOUND).send({ error: 'Unknown voice' })
      }
      if (!ports.speechSynthesis.isInstalled()) {
        return reply.status(STATUS_CONFLICT).send({
          error: 'Audiobook engine not installed',
          needsInstall: true,
        })
      }

      const buffer = await ports.speechSynthesis.synthesizePreview(voiceId)
      reply.header('Content-Type', 'audio/wav')
      reply.header('Cache-Control', `public, max-age=${VOICE_PREVIEW_CACHE_MAX_AGE_S}`)
      return reply.send(buffer)
    },
  )
}
