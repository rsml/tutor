import type { FastifyInstance } from 'fastify'
import * as taskManager from '../services/task-manager.js'
import {
  getMissingComponents,
  isInstalled,
  installAll,
} from '../services/audiobook-installer.js'
import { listVoices, synthesizePreview } from '../services/kokoro-service.js'

// Top-level audiobook engine routes (not scoped to a specific book).
//
// Per-book audiobook routes live alongside the rest of the book API in
// routes/books.ts so they share the same `bookIdSchema` + validateChapterNum
// helpers.
export async function audiobookRoutes(fastify: FastifyInstance) {
  // GET /api/audiobook/status — engine install state
  fastify.get('/api/audiobook/status', async () => {
    const missing = getMissingComponents()
    return {
      installed: isInstalled(),
      missing: { model: missing.model, ffmpeg: missing.ffmpeg },
      downloadSize: missing.totalBytes,
    }
  })

  // POST /api/audiobook/install — kick off Kokoro + ffmpeg download
  fastify.post<{ Body: unknown }>('/api/audiobook/install', async (request, reply) => {
    const body = (request.body ?? {}) as { force?: boolean }
    const alreadyInstalled = isInstalled()
    if (alreadyInstalled && !body.force) {
      return reply.status(409).send({ error: 'Audiobook engine already installed' })
    }

    // System-wide install — bookId='_engine' is a synthetic key so the task
    // shows up in the global tasks list without colliding with any real book id.
    if (taskManager.getActiveTaskForBook('_engine', 'install-audiobook')) {
      return reply.status(409).send({ error: 'Audiobook install already in progress' })
    }

    const missing = getMissingComponents()
    const totalBytes = missing.totalBytes || 1 // avoid div-by-zero if already installed + force

    // total=100 so progress reports as a percentage; the label carries the
    // human-readable MB/MB string from the installer.
    const task = taskManager.createTask('install-audiobook', '_engine', 'Audiobook narration', 100)

    ;(async () => {
      try {
        await installAll((progress) => {
          if (task.abortController.signal.aborted) return
          const pct = Math.max(
            0,
            Math.min(100, Math.floor((progress.bytesDownloaded / totalBytes) * 100)),
          )
          taskManager.updateProgress(task.id, pct, progress.label)
        }, task.abortController.signal)

        taskManager.completeTask(task.id)
      } catch (err) {
        if (task.abortController.signal.aborted) return
        const msg = err instanceof Error ? err.message : 'Audiobook install failed'
        taskManager.failTask(task.id, msg)
      }
    })()

    return { taskId: task.id }
  })

  // GET /api/audiobook/voices — list available voices for the picker
  fastify.get('/api/audiobook/voices', async () => {
    return { voices: listVoices() }
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
      const voices = listVoices()
      if (!voices.some((v) => v.id === voiceId)) {
        return reply.status(404).send({ error: 'Unknown voice' })
      }
      if (!isInstalled()) {
        return reply.status(409).send({
          error: 'Audiobook engine not installed',
          needsInstall: true,
        })
      }

      const buffer = await synthesizePreview(voiceId)
      reply.header('Content-Type', 'audio/wav')
      reply.header('Cache-Control', 'public, max-age=2592000')
      return reply.send(buffer)
    },
  )
}
