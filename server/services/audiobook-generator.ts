import { mkdir, rm } from 'node:fs/promises'
import * as store from './book-store.js'
import { stripMarkdownForNarration } from './markdown-to-narration.js'
import {
  synthesizeChapter,
  getRecommendedWorkerCount,
  startWorkerPool,
  stopWorkerPool,
} from './kokoro-service.js'
import { createFfmpegAudioAssembly } from '../adapters/ffmpeg-audio-assembly.js'
import { updateProgress, completeTask } from './task-manager.js'
import type { AudiobookManifest, AudiobookChapterEntry } from '@shared/domain.js'
import { M4B_BITRATE } from '../constants.js'

export interface GenerateAudiobookOpts {
  voiceId: string
  speed: number
  workerOverride?: number
}

const MANIFEST_VERSION = 1

// Single module-scope instance of the ffmpeg-backed AudioAssembly adapter.
// generateAudiobook below delegates every ffmpeg concern (duration probing,
// concatenation, chapter markers, cover embedding) to it.
const audioAssembly = createFfmpegAudioAssembly()

// Kept as its own export for backward compatibility — nothing outside this
// module calls it today, but it mirrors generateAudiobook's own signature
// promise. Delegates to the adapter's probeDurationSec.
export async function getAudioDurationSec(path: string, signal: AbortSignal): Promise<number> {
  return audioAssembly.probeDurationSec(path, signal)
}

async function tryRm(path: string): Promise<void> {
  try {
    await rm(path, { force: true })
  } catch {
    // ignore — best-effort tmp cleanup
  }
}

export async function generateAudiobook(
  bookId: string,
  opts: GenerateAudiobookOpts,
  taskId: string,
  abortSignal: AbortSignal,
): Promise<void> {
  console.log(`[audiobook-generator] Starting generation for book ${bookId} (voice=${opts.voiceId}, speed=${opts.speed})`)

  // 1. Cleanup prior artifacts so regeneration starts from a clean slate.
  await store.deleteAudiobookArtifacts(bookId)

  // 2. Reset the incremental progress field on meta.
  const initialMeta = await store.getBook(bookId)
  initialMeta.audioGeneratedChapters = []
  initialMeta.updatedAt = new Date().toISOString()
  await store.saveBook(initialMeta)

  // 3. Load book context.
  const toc = await store.getToc(bookId)
  const totalChapters = initialMeta.totalChapters
  if (toc.chapters.length !== totalChapters) {
    throw new Error(
      `TOC chapter count (${toc.chapters.length}) does not match meta.totalChapters (${totalChapters})`,
    )
  }

  // Ensure the audio dir exists for WAV writes.
  await mkdir(store.audioDir(bookId), { recursive: true })

  // 4. Spin up the Kokoro worker pool. workerOverride may eventually come from
  // the learning profile; for v1 the route passes undefined and we fall back
  // to the RAM/CPU heuristic.
  const workerCount = getRecommendedWorkerCount(opts.workerOverride)
  await startWorkerPool(workerCount)

  try {
    // 5. Per-chapter narration loop (sequential w.r.t. progress reporting; the
    // worker pool internally serializes inference today, see kokoro-service).
    for (let n = 1; n <= totalChapters; n++) {
      if (abortSignal.aborted) throw new Error('Audiobook generation aborted')

      const chapterTitle = toc.chapters[n - 1].title
      updateProgress(taskId, n - 1, `Narrating chapter ${n} of ${totalChapters}: ${chapterTitle}`)

      const md = await store.getChapter(bookId, n)
      const narrationBody = stripMarkdownForNarration(md)
      const narration = `Chapter ${n}: ${chapterTitle}.\n\n${narrationBody}`

      // Rough sentence estimate from the narration text so per-sentence
      // progress can show "Narrating sentence 12 of ~80" (the user otherwise
      // sees no movement for the ~5-15 minutes a single chapter takes).
      const sentenceEstimate = Math.max(1, (narration.match(/[.!?]+(?:\s|$)/g) ?? []).length)

      const wavPath = store.chapterWavPath(bookId, n)
      await synthesizeChapter(
        narration,
        opts.voiceId,
        opts.speed,
        wavPath,
        abortSignal,
        (sentenceIdx) => {
          // current stays at n-1 (chapter granularity); label tells the story.
          updateProgress(
            taskId,
            n - 1,
            `Narrating chapter ${n} of ${totalChapters}: sentence ${sentenceIdx + 1} of ~${sentenceEstimate}`,
          )
        },
      )

      if (abortSignal.aborted) throw new Error('Audiobook generation aborted')

      // Mark this chapter as audio-ready. Per-chapter playback comes from
      // the unified M4B with currentTime seek (one source of truth), so we
      // intentionally don't write a separate MP3 per chapter -- the M4B
      // exposes the same audio with proper duration/seek metadata that
      // libmp3lame's ABR output doesn't reliably advertise to browsers.
      // The flag still lights up the per-chapter Listen button progressively;
      // the audio source switches once the M4B stitch completes.
      const meta = await store.getBook(bookId)
      if (!meta.audioGeneratedChapters.includes(n)) {
        meta.audioGeneratedChapters = [...meta.audioGeneratedChapters, n]
      }
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)

      updateProgress(taskId, n, `Narrated chapter ${n} of ${totalChapters}`)
    }

    if (abortSignal.aborted) throw new Error('Audiobook generation aborted')

    // 6. Stitch phase: probe durations, then hand concatenation, chapter
    // markers, and cover embedding off to the AudioAssembly adapter.
    updateProgress(taskId, totalChapters, 'Stitching audiobook (this may take a minute)...')

    const finalMeta = await store.getBook(bookId)
    const chapterEntries: Array<{ num: number; title: string; durationSec: number; startSec: number }> = []
    let cursorSec = 0
    for (let n = 1; n <= totalChapters; n++) {
      const wavPath = store.chapterWavPath(bookId, n)
      const durationSec = await getAudioDurationSec(wavPath, abortSignal)
      chapterEntries.push({
        num: n,
        title: toc.chapters[n - 1].title,
        durationSec,
        startSec: cursorSec,
      })
      cursorSec += durationSec
    }

    const m4bPath = store.audiobookPath(bookId)
    const coverPath = await store.getCoverPath(bookId)

    await audioAssembly.concatToM4b({
      inputs: Array.from({ length: totalChapters }, (_, i) => store.chapterWavPath(bookId, i + 1)),
      // Marker labels get the "Chapter N:" prefix; the persisted manifest
      // below keeps the plain per-chapter titles, matching what the reader
      // UI expects.
      chapters: chapterEntries.map((c) => ({
        num: c.num,
        title: `Chapter ${c.num}: ${c.title}`,
        mp3Path: store.chapterAudioPath(bookId, c.num),
        durationSec: c.durationSec,
        startSec: c.startSec,
      })),
      out: m4bPath,
      bitrate: M4B_BITRATE,
      bookTitle: finalMeta.title,
      coverPath: coverPath ?? undefined,
      signal: abortSignal,
    })

    if (abortSignal.aborted) throw new Error('Audiobook generation aborted')

    // 7. Delete WAVs now that the M4B has them — the per-chapter MP3s remain
    // for individual chapter playback.
    for (let n = 1; n <= totalChapters; n++) {
      await tryRm(store.chapterWavPath(bookId, n))
    }

    // 8. Write the manifest.
    const manifestChapters: AudiobookChapterEntry[] = chapterEntries.map((c) => ({
      num: c.num,
      title: c.title,
      mp3Path: store.chapterAudioPath(bookId, c.num),
      durationSec: c.durationSec,
      startSec: c.startSec,
    }))
    const manifest: AudiobookManifest = {
      version: MANIFEST_VERSION,
      voice: opts.voiceId,
      speed: opts.speed,
      generatedAt: new Date().toISOString(),
      m4bPath,
      chapters: manifestChapters,
    }
    await store.saveAudiobookManifest(bookId, manifest)

    console.log(`[audiobook-generator] Completed audiobook for book ${bookId} -> ${m4bPath}`)

    // 9. Mark the task done. Caller already created the task with total=N+1
    // (narration + 1 stitch tick), but we conservatively pass the final path.
    completeTask(taskId, { path: m4bPath })
  } finally {
    // Always release the worker pool slot count so subsequent generations get
    // a fresh concurrency setting (the underlying TTS instance is reused).
    await stopWorkerPool()
  }
}
