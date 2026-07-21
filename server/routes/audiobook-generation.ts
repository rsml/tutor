import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import * as store from '../services/book-store.js'
import * as taskManager from '../services/task-manager.js'
import { GenerateAudiobookBodySchema } from '@shared/contracts.js'
import { isInstalled as isAudiobookEngineInstalled } from '../services/audiobook-installer.js'
import { generateAudiobook } from '../services/audiobook-generator.js'
import { listVoices } from '../services/kokoro-service.js'
import { sendMediaWithRange } from '../http/send-media-range.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import type { Ports } from '../composition-root.js'

// Per-book audiobook generation routes. The top-level audiobook engine
// install and voice routes (/api/audiobook/*) live in routes/audiobook.ts —
// two files, two concerns.
export async function audiobookGenerationRoutes(fastify: FastifyInstance, _opts: { ports: Ports }) {
  // POST /api/books/:id/audiobook — start generation
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/audiobook',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      let body: z.infer<typeof GenerateAudiobookBodySchema>
      try {
        body = GenerateAudiobookBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      const bookId = request.params.id
      const meta = await store.getBook(bookId)

      // Gate 1: book must be fully generated.
      if (meta.generatedUpTo < meta.totalChapters) {
        return reply.status(400).send({ error: 'Book is not fully generated' })
      }

      // Gate 2: model + ffmpeg must be installed.
      if (!isAudiobookEngineInstalled()) {
        return reply.status(409).send({
          error: 'Audiobook engine not installed',
          needsInstall: true,
        })
      }

      // Gate 3: only one generation per book at a time.
      if (taskManager.getActiveTaskForBook(bookId, 'generate-audiobook')) {
        return reply.status(409).send({ error: 'Audiobook generation already in progress' })
      }

      // Gate 4: don't silently clobber an existing audiobook.
      if (store.audiobookExists(bookId) && !body.confirmReplace) {
        return reply.status(409).send({ error: 'Audiobook already exists', exists: true })
      }

      // Resolve voice + speed: body > profile defaults > first male voice / 1.0.
      let profile: Awaited<ReturnType<typeof store.getProfile>> | null = null
      try {
        profile = await store.getProfile()
      } catch {
        // Profile may not exist on a fresh install; fall through to fallbacks.
      }

      const audiobookPrefs = profile?.preferences.audiobook
      const voices = listVoices()
      const fallbackVoice = voices.find((v) => v.gender === 'Male')?.id ?? voices[0]?.id ?? 'am_michael'
      const voiceId = body.voiceId ?? audiobookPrefs?.defaultVoiceId ?? fallbackVoice
      const speed = body.speed ?? audiobookPrefs?.defaultSpeed ?? 1.0

      // Persist defaults if asked. Don't fail the request on profile save errors.
      if (body.rememberAsDefault && profile) {
        try {
          profile.preferences.audiobook = {
            defaultVoiceId: voiceId,
            defaultSpeed: speed,
            ...(audiobookPrefs?.workerOverride !== undefined
              ? { workerOverride: audiobookPrefs.workerOverride }
              : {}),
          }
          await store.saveProfile(profile)
        } catch (err) {
          fastify.log.warn({ err }, 'Failed to persist audiobook defaults to profile')
        }
      }

      // total=N chapters; the generator updates progress per chapter narrated.
      const task = taskManager.createTask(
        'generate-audiobook',
        bookId,
        meta.title,
        meta.totalChapters,
      )

      ;(async () => {
        try {
          await generateAudiobook(
            bookId,
            { voiceId, speed },
            task.id,
            task.abortController.signal,
          )
          // generator calls completeTask itself on success.
        } catch (err) {
          if (task.abortController.signal.aborted) return
          const msg = err instanceof Error ? err.message : 'Audiobook generation failed'
          // Wipe the half-baked audio state so the user isn't left with a
          // book.m4b-less directory of orphaned MP3s and a stale
          // audioGeneratedChapters list that lights up Listen buttons for
          // chapters whose files we'll re-narrate on retry anyway.
          try {
            await store.deleteAudiobookArtifacts(bookId)
            const latest = await store.getBook(bookId)
            if (latest.audioGeneratedChapters.length > 0) {
              latest.audioGeneratedChapters = []
              latest.updatedAt = new Date().toISOString()
              await store.saveBook(latest)
            }
          } catch (cleanupErr) {
            fastify.log.warn({ err: cleanupErr }, 'Audiobook cleanup-on-failure encountered an error')
          }
          taskManager.failTask(task.id, msg)
        }
      })()

      return { taskId: task.id }
    },
  )

  // GET /api/books/:id/audiobook — status + manifest
  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/audiobook',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const bookId = request.params.id
      const exists = store.audiobookExists(bookId)
      const manifest = exists ? await store.getAudiobookManifest(bookId) : null
      const meta = await store.getBook(bookId)
      return {
        exists,
        path: exists ? `/api/books/${bookId}/audiobook/file` : undefined,
        manifest,
        generatedChapters: meta.audioGeneratedChapters ?? [],
      }
    },
  )

  // GET /api/books/:id/audiobook/file — stream the M4B
  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/audiobook/file',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const bookId = request.params.id
      const path = store.audiobookPath(bookId)
      const meta = await store.getBook(bookId)
      const disposition = `inline; filename="${encodeURIComponent(meta.title)}.m4b"`
      await sendMediaWithRange(reply, request.headers.range, path, 'audio/mp4', { disposition })
    },
  )

  // GET /api/books/:id/chapters/:num/audio — chapter audio with HTTP Range.
  //
  // New audiobooks: the chapter plays from the unified M4B (one source of
  // truth, proper duration/seek metadata that lame ABR MP3 lacks); the
  // client seeks to chapter start.
  //
  // Legacy audiobooks generated before that change still have per-chapter
  // MP3 files on disk; we fall back to those for compatibility.
  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num/audio',
    { schema: { params: bookChapterSchema } },
    async (request, reply) => {
      const bookId = request.params.id
      const num = parseInt(request.params.num, 10)
      const { existsSync } = await import('node:fs')

      const legacyMp3 = store.chapterAudioPath(bookId, num)
      const useLegacyMp3 = existsSync(legacyMp3)
      const path = useLegacyMp3 ? legacyMp3 : store.audiobookPath(bookId)
      const contentType = useLegacyMp3 ? 'audio/mpeg' : 'audio/mp4'
      await sendMediaWithRange(reply, request.headers.range, path, contentType)
    },
  )

  // GET /api/books/:id/chapters/:num/audio/status — lightweight existence check
  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num/audio/status',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const bookId = request.params.id
      const num = parseInt(request.params.num, 10)
      return { exists: await store.chapterAudioExists(bookId, num) }
    },
  )

  // POST /api/books/:id/audiobook/reveal — reveal in Finder/Explorer.
  // Spawns the OS reveal command directly from the server (which is the
  // user's local machine) so we don't depend on Electron IPC being wired
  // up correctly in the renderer. Returns { path, revealed } so the
  // client can fall back if the OS-side reveal failed.
  fastify.post<{ Params: { id: string } }>(
    '/api/books/:id/audiobook/reveal',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const bookId = request.params.id
      const { existsSync } = await import('node:fs')
      const path = store.audiobookPath(bookId)
      if (!existsSync(path)) {
        return reply.status(404).send({ error: 'Audiobook not found' })
      }
      let revealed = false
      try {
        const { spawn } = await import('node:child_process')
        if (process.platform === 'darwin') {
          spawn('open', ['-R', path], { detached: true, stdio: 'ignore' }).unref()
          revealed = true
        } else if (process.platform === 'win32') {
          spawn('explorer.exe', ['/select,', path], { detached: true, stdio: 'ignore' }).unref()
          revealed = true
        } else {
          // Linux: xdg-open opens the parent folder (no native reveal-and-select).
          const dir = path.substring(0, path.lastIndexOf('/'))
          spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref()
          revealed = true
        }
      } catch {
        // best-effort — client will fall back to clipboard / IPC / displaying the path
      }
      return { path, revealed }
    },
  )
}
