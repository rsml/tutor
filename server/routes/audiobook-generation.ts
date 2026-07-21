import type { FastifyInstance } from 'fastify'
import { GenerateAudiobookBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { sendMediaWithRange } from '../http/send-media-range.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { STATUS_BAD_REQUEST, STATUS_CONFLICT, STATUS_NOT_FOUND } from '../http/status.js'
import type { Ports, SharedServices } from '../composition-root.js'
import { createGenerateAudiobook } from '../services/generate-audiobook.js'
import { resolveChapterAudioFile } from '../services/resolve-chapter-audio-file.js'

// Per-book audiobook generation routes. The top-level audiobook engine
// install and voice routes (/api/audiobook/*) live in routes/audiobook.ts —
// two files, two concerns.
export async function audiobookGenerationRoutes(fastify: FastifyInstance, opts: { ports: Ports; services: SharedServices }) {
  const { ports } = opts
  const generateAudiobook = createGenerateAudiobook({
    bookRepository: ports.bookRepository,
    artifactStore: ports.artifactStore,
    speechSynthesis: ports.speechSynthesis,
    audioAssembly: ports.audioAssembly,
    backgroundTasks: ports.backgroundTasks,
    // The live route journals its checkpoints too, not just the resume pass
    // that rebuilds this service at boot. Without this the checkpoint calls
    // inside the narration loop would be unreachable in production, which
    // is worse than not having written them, and an interrupted audiobook
    // would resume with no idea how far it had got.
    journal: ports.jobJournal,
  })

  // POST /api/books/:id/audiobook — start generation
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/audiobook',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const body = parseBody(GenerateAudiobookBodySchema, request.body)
      const result = await generateAudiobook({ bookId: request.params.id, ...body })

      switch (result.outcome) {
        case 'not-complete':
          return reply.status(STATUS_BAD_REQUEST).send({ error: 'Book is not fully generated' })
        case 'engine-not-installed':
          return reply.status(STATUS_CONFLICT).send({ error: 'Audiobook engine not installed', needsInstall: true })
        case 'in-progress':
          return reply.status(STATUS_CONFLICT).send({ error: 'Audiobook generation already in progress' })
        case 'exists':
          return reply.status(STATUS_CONFLICT).send({ error: 'Audiobook already exists', exists: true })
        case 'started':
          return { taskId: result.taskId }
      }
    },
  )

  // GET /api/books/:id/audiobook — status + manifest
  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/audiobook',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const bookId = request.params.id
      const exists = ports.artifactStore.audiobookExists(bookId)
      const manifest = exists ? await ports.artifactStore.getAudiobookManifest(bookId) : null
      const meta = await ports.bookRepository.getBook(bookId)
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
      const path = ports.artifactStore.audiobookPath(bookId)
      const meta = await ports.bookRepository.getBook(bookId)
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
  // MP3 files on disk; resolveChapterAudioFile falls back to those for
  // compatibility.
  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num/audio',
    { schema: { params: bookChapterSchema } },
    async (request, reply) => {
      const bookId = request.params.id
      const num = parseInt(request.params.num, 10)
      const file = resolveChapterAudioFile(bookId, num, ports.artifactStore)
      await sendMediaWithRange(reply, request.headers.range, file.path, file.contentType)
    },
  )

  // GET /api/books/:id/chapters/:num/audio/status — lightweight existence check
  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num/audio/status',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const bookId = request.params.id
      const num = parseInt(request.params.num, 10)
      return { exists: await ports.artifactStore.chapterAudioExists(bookId, num) }
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
      if (!ports.artifactStore.audiobookExists(bookId)) {
        return reply.status(STATUS_NOT_FOUND).send({ error: 'Audiobook not found' })
      }
      const path = ports.artifactStore.audiobookPath(bookId)
      // osFileManager.reveal resolves once the OS has been asked, regardless
      // of whether the OS-side command actually succeeded (see that port's
      // own doc), matching this route's previous best-effort contract.
      await ports.osFileManager.reveal(path)
      return { path, revealed: true }
    },
  )
}
