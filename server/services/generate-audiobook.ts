import os from 'node:os'
import { mkdir, rm } from 'node:fs/promises'
import { stripMarkdownForNarration } from './markdown-to-narration.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore } from '../ports/artifact-store.js'
import type { SpeechSynthesis } from '../ports/speech-synthesis.js'
import type { AudioAssembly } from '../ports/audio-assembly.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { AudiobookManifest, AudiobookChapterEntry, BookMeta, LearningProfile } from '@shared/domain.js'
import { M4B_BITRATE } from '../constants.js'

/**
 * Generates a book's audiobook: the gates the old POST /api/books/:id/audiobook
 * route handler used to run inline, voice and speed resolution against the
 * learning profile, and the per-chapter narration and ffmpeg stitch loop
 * that used to live in this same file under the name audiobook-generator.ts
 * (generateAudiobook(bookId, opts, taskId, signal)). All three are now one
 * unit behind createGenerateAudiobook(deps), so the route becomes wiring:
 * parse the body, call the one returned function, map its result to a
 * response.
 */

const MANIFEST_VERSION = 1

export interface GenerateAudiobookDeps {
  bookRepository: Pick<BookRepository, 'getBook' | 'saveBook' | 'getProfile' | 'saveProfile' | 'getToc' | 'getChapter'>
  artifactStore: Pick<
    ArtifactStore,
    | 'audiobookExists'
    | 'deleteAudiobookArtifacts'
    | 'audioDir'
    | 'chapterWavPath'
    | 'chapterAudioPath'
    | 'audiobookPath'
    | 'getCoverPath'
    | 'saveAudiobookManifest'
  >
  speechSynthesis: Pick<SpeechSynthesis, 'isInstalled' | 'listVoices' | 'startWorkerPool' | 'stopWorkerPool' | 'synthesizeChapter'>
  audioAssembly: AudioAssembly
  backgroundTasks: BackgroundTasks
}

export interface GenerateAudiobookRequest {
  bookId: string
  voiceId?: string
  speed?: number
  confirmReplace?: boolean
  rememberAsDefault?: boolean
}

export type GenerateAudiobookResult =
  | { outcome: 'not-complete' }
  | { outcome: 'engine-not-installed' }
  | { outcome: 'in-progress' }
  | { outcome: 'exists' }
  | { outcome: 'started'; taskId: string }

/**
 * Worker-count sizing policy, lifted verbatim from
 * server/services/kokoro-service.ts's getRecommendedWorkerCount. Kept as a
 * private copy here rather than imported, because kokoro-service.ts is a
 * temporary shim over the SpeechSynthesis adapter singleton (see that
 * file's own doc) and this sizing policy is not part of the SpeechSynthesis
 * port's contract (see speech-synthesis.ts's own doc for why): it is a pure
 * function of the host machine, not a synthesis capability. RAM budget is
 * 25% of total RAM at 600MB per worker, capped by CPU count and a hard
 * ceiling of 16, with an optional caller override.
 */
function recommendedWorkerCount(totalMemBytes: number, cpuCount: number, override?: number): number {
  const ramBudget = Math.floor((totalMemBytes * 0.25) / (600 * 1024 * 1024))
  return Math.max(1, Math.min(override ?? Infinity, ramBudget, cpuCount, 16))
}

async function tryRm(path: string): Promise<void> {
  try {
    await rm(path, { force: true })
  } catch {
    // ignore — best-effort tmp cleanup
  }
}

export function createGenerateAudiobook(deps: GenerateAudiobookDeps) {
  const { bookRepository, artifactStore, speechSynthesis, audioAssembly, backgroundTasks } = deps

  async function narrate(meta: BookMeta, voiceId: string, speed: number, taskId: string, signal: AbortSignal): Promise<void> {
    const bookId = meta.id

    // 1. Cleanup prior artifacts so regeneration starts from a clean slate.
    await artifactStore.deleteAudiobookArtifacts(bookId)

    // 2. Reset the incremental progress field on meta.
    const initialMeta = await bookRepository.getBook(bookId)
    initialMeta.audioGeneratedChapters = []
    initialMeta.updatedAt = new Date().toISOString()
    await bookRepository.saveBook(initialMeta)

    // 3. Load book context.
    const toc = await bookRepository.getToc(bookId)
    const totalChapters = initialMeta.totalChapters
    if (toc.chapters.length !== totalChapters) {
      throw new Error(
        `TOC chapter count (${toc.chapters.length}) does not match meta.totalChapters (${totalChapters})`,
      )
    }

    // Ensure the audio dir exists for WAV writes.
    await mkdir(artifactStore.audioDir(bookId), { recursive: true })

    // 4. Spin up the narration worker pool.
    const workerCount = recommendedWorkerCount(os.totalmem(), os.cpus().length)
    await speechSynthesis.startWorkerPool(workerCount)

    try {
      // 5. Per-chapter narration loop (sequential w.r.t. progress reporting).
      for (let n = 1; n <= totalChapters; n++) {
        if (signal.aborted) throw new Error('Audiobook generation aborted')

        const chapterTitle = toc.chapters[n - 1].title
        backgroundTasks.report(taskId, n - 1, `Narrating chapter ${n} of ${totalChapters}: ${chapterTitle}`)

        const md = await bookRepository.getChapter(bookId, n)
        const narrationBody = stripMarkdownForNarration(md)
        const narration = `Chapter ${n}: ${chapterTitle}.\n\n${narrationBody}`

        // Rough sentence estimate so per-sentence progress can show
        // "Narrating sentence 12 of ~80" (the user otherwise sees no
        // movement for the several minutes a single chapter takes).
        const sentenceEstimate = Math.max(1, (narration.match(/[.!?]+(?:\s|$)/g) ?? []).length)

        const wavPath = artifactStore.chapterWavPath(bookId, n)
        await speechSynthesis.synthesizeChapter({
          text: narration,
          voiceId,
          speed,
          outPath: wavPath,
          signal,
          onSentence: (sentenceIdx) => {
            backgroundTasks.report(
              taskId,
              n - 1,
              `Narrating chapter ${n} of ${totalChapters}: sentence ${sentenceIdx + 1} of ~${sentenceEstimate}`,
            )
          },
        })

        if (signal.aborted) throw new Error('Audiobook generation aborted')

        // Mark this chapter as audio-ready. Per-chapter playback comes from
        // the unified M4B with currentTime seek (one source of truth), so
        // no separate MP3 per chapter is written here.
        const meta2 = await bookRepository.getBook(bookId)
        if (!meta2.audioGeneratedChapters.includes(n)) {
          meta2.audioGeneratedChapters = [...meta2.audioGeneratedChapters, n]
        }
        meta2.updatedAt = new Date().toISOString()
        await bookRepository.saveBook(meta2)

        backgroundTasks.report(taskId, n, `Narrated chapter ${n} of ${totalChapters}`)
      }

      if (signal.aborted) throw new Error('Audiobook generation aborted')

      // 6. Stitch phase: probe durations, then hand concatenation, chapter
      // markers, and cover embedding off to AudioAssembly.
      backgroundTasks.report(taskId, totalChapters, 'Stitching audiobook (this may take a minute)...')

      const finalMeta = await bookRepository.getBook(bookId)
      const chapterEntries: Array<{ num: number; title: string; durationSec: number; startSec: number }> = []
      let cursorSec = 0
      for (let n = 1; n <= totalChapters; n++) {
        const wavPath = artifactStore.chapterWavPath(bookId, n)
        const durationSec = await audioAssembly.probeDurationSec(wavPath, signal)
        chapterEntries.push({ num: n, title: toc.chapters[n - 1].title, durationSec, startSec: cursorSec })
        cursorSec += durationSec
      }

      const m4bPath = artifactStore.audiobookPath(bookId)
      const coverPath = await artifactStore.getCoverPath(bookId)

      await audioAssembly.concatToM4b({
        inputs: Array.from({ length: totalChapters }, (_, i) => artifactStore.chapterWavPath(bookId, i + 1)),
        // Marker labels get the "Chapter N:" prefix; the persisted manifest
        // below keeps the plain per-chapter titles, matching what the
        // reader UI expects.
        chapters: chapterEntries.map((c) => ({
          num: c.num,
          title: `Chapter ${c.num}: ${c.title}`,
          mp3Path: artifactStore.chapterAudioPath(bookId, c.num),
          durationSec: c.durationSec,
          startSec: c.startSec,
        })),
        out: m4bPath,
        bitrate: M4B_BITRATE,
        bookTitle: finalMeta.title,
        coverPath: coverPath ?? undefined,
        signal,
      })

      if (signal.aborted) throw new Error('Audiobook generation aborted')

      // 7. Delete WAVs now that the M4B has them.
      for (let n = 1; n <= totalChapters; n++) {
        await tryRm(artifactStore.chapterWavPath(bookId, n))
      }

      // 8. Write the manifest.
      const manifestChapters: AudiobookChapterEntry[] = chapterEntries.map((c) => ({
        num: c.num,
        title: c.title,
        mp3Path: artifactStore.chapterAudioPath(bookId, c.num),
        durationSec: c.durationSec,
        startSec: c.startSec,
      }))
      const manifest: AudiobookManifest = {
        version: MANIFEST_VERSION,
        voice: voiceId,
        speed,
        generatedAt: new Date().toISOString(),
        m4bPath,
        chapters: manifestChapters,
      }
      await artifactStore.saveAudiobookManifest(bookId, manifest)

      // 9. Mark the task done.
      backgroundTasks.succeed(taskId, { path: m4bPath })
    } finally {
      // Always release the worker pool slot count so subsequent generations
      // get a fresh concurrency setting.
      await speechSynthesis.stopWorkerPool()
    }
  }

  return async function generateAudiobook(req: GenerateAudiobookRequest): Promise<GenerateAudiobookResult> {
    const { bookId } = req
    const meta = await bookRepository.getBook(bookId)

    // Gate 1: book must be fully generated.
    if (meta.generatedUpTo < meta.totalChapters) {
      return { outcome: 'not-complete' }
    }

    // Gate 2: the narration engine must be installed.
    if (!speechSynthesis.isInstalled()) {
      return { outcome: 'engine-not-installed' }
    }

    // Gate 3: only one generation per book at a time.
    if (backgroundTasks.findActive(bookId, 'generate-audiobook')) {
      return { outcome: 'in-progress' }
    }

    // Gate 4: don't silently clobber an existing audiobook.
    if (artifactStore.audiobookExists(bookId) && !req.confirmReplace) {
      return { outcome: 'exists' }
    }

    // Resolve voice + speed: request > profile defaults > first male voice / 1.0.
    let profile: LearningProfile | null = null
    try {
      profile = await bookRepository.getProfile()
    } catch {
      // Profile may not exist on a fresh install; fall through to fallbacks.
    }

    const audiobookPrefs = profile?.preferences.audiobook
    const voices = speechSynthesis.listVoices()
    const fallbackVoice = voices.find((v) => v.gender === 'Male')?.id ?? voices[0]?.id ?? 'am_michael'
    const voiceId = req.voiceId ?? audiobookPrefs?.defaultVoiceId ?? fallbackVoice
    const speed = req.speed ?? audiobookPrefs?.defaultSpeed ?? 1.0

    // Persist defaults if asked. Don't fail the request on profile save errors.
    if (req.rememberAsDefault && profile) {
      try {
        profile.preferences.audiobook = {
          defaultVoiceId: voiceId,
          defaultSpeed: speed,
          ...(audiobookPrefs?.workerOverride !== undefined ? { workerOverride: audiobookPrefs.workerOverride } : {}),
        }
        await bookRepository.saveProfile(profile)
      } catch (err) {
        console.warn('[generate-audiobook] Failed to persist audiobook defaults to profile', err)
      }
    }

    // total=N chapters; narrate() reports progress per chapter narrated.
    const handle = backgroundTasks.start({
      type: 'generate-audiobook',
      bookId,
      bookTitle: meta.title,
      total: meta.totalChapters,
    })

    ;(async () => {
      try {
        await narrate(meta, voiceId, speed, handle.id, handle.signal)
        // narrate() calls backgroundTasks.succeed itself on success.
      } catch (err) {
        if (handle.signal.aborted) return
        const msg = err instanceof Error ? err.message : 'Audiobook generation failed'
        // Wipe the half-baked audio state so the user isn't left with a
        // book.m4b-less directory of orphaned MP3s and a stale
        // audioGeneratedChapters list that lights up Listen buttons for
        // chapters whose files get re-narrated on retry anyway.
        try {
          await artifactStore.deleteAudiobookArtifacts(bookId)
          const latest = await bookRepository.getBook(bookId)
          if (latest.audioGeneratedChapters.length > 0) {
            latest.audioGeneratedChapters = []
            latest.updatedAt = new Date().toISOString()
            await bookRepository.saveBook(latest)
          }
        } catch (cleanupErr) {
          console.warn('[generate-audiobook] Cleanup-on-failure encountered an error', cleanupErr)
        }
        backgroundTasks.fail(handle.id, msg)
      }
    })()

    return { outcome: 'started', taskId: handle.id }
  }
}
