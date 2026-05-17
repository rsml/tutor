import { execFile } from 'node:child_process'
import { writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import * as store from './book-store.js'
import { stripMarkdownForNarration } from './markdown-to-narration.js'
import {
  synthesizeChapter,
  getRecommendedWorkerCount,
  startWorkerPool,
  stopWorkerPool,
} from './kokoro-service.js'
import { getFfmpegPath } from './audiobook-installer.js'
import { updateProgress, completeTask } from './task-manager.js'
import type { AudiobookManifest, AudiobookChapterEntry } from '../schemas.js'

export interface GenerateAudiobookOpts {
  voiceId: string
  speed: number
  workerOverride?: number
}

const MANIFEST_VERSION = 1
const MP3_BITRATE = '96k'
const M4B_BITRATE = '64k'

// Run ffmpeg with the configured binary, surfacing stderr on non-zero exit.
// Wraps node:child_process.execFile so the AbortSignal kills hung processes
// (e.g., long stitches cancelled by the user).
async function runFfmpeg(args: string[], signal: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  if (signal.aborted) throw new Error('Audiobook generation aborted')
  const ffmpegPath = getFfmpegPath()
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      args,
      // maxBuffer: ffmpeg's stderr can balloon over a multi-minute stitch.
      { signal, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code
          if (code === 'ABORT_ERR' || signal.aborted) {
            reject(new Error('Audiobook generation aborted'))
            return
          }
          reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

// Probe an audio file's duration using ffmpeg's "-i ... -f null -" stderr
// output. We don't ship ffprobe (the evermeet.cx ffmpeg-only zip), so we parse
// the human-readable "Duration: HH:MM:SS.ss" line ffmpeg always emits.
export async function getAudioDurationSec(path: string, signal: AbortSignal): Promise<number> {
  const { stderr } = await runFfmpeg(
    ['-hide_banner', '-i', path, '-f', 'null', '-'],
    signal,
  )
  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!match) {
    throw new Error(`Could not parse duration from ffmpeg output for ${path}`)
  }
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const s = parseFloat(match[3])
  return h * 3600 + m * 60 + s
}

// Build the FFMETADATA1 file ffmpeg uses to write chapter markers into the M4B.
// TIMEBASE=1/1000 means START/END are in milliseconds.
function buildFfmetadata(
  bookTitle: string,
  chapters: Array<{ title: string; startMs: number; endMs: number }>,
): string {
  const lines: string[] = [';FFMETADATA1']
  lines.push(`title=${escapeMeta(bookTitle)}`)
  lines.push('artist=Tutor')
  lines.push('genre=Audiobook')
  lines.push('')
  for (const ch of chapters) {
    lines.push('[CHAPTER]')
    lines.push('TIMEBASE=1/1000')
    lines.push(`START=${ch.startMs}`)
    lines.push(`END=${ch.endMs}`)
    lines.push(`title=${escapeMeta(ch.title)}`)
    lines.push('')
  }
  return lines.join('\n')
}

// FFMETADATA1 requires escaping =, ;, #, \, and newlines with a leading backslash.
function escapeMeta(value: string): string {
  return value.replace(/[\\=;#\n]/g, (c) => (c === '\n' ? '\\\n' : `\\${c}`))
}

// Build the file list for ffmpeg's concat demuxer. Single quotes around the
// path; embedded single quotes get escaped per the demuxer spec ('\'' style).
function buildConcatList(absPaths: string[]): string {
  return absPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
}

async function writeAtomic(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  if (typeof data === 'string') {
    await writeFile(tmp, data, 'utf-8')
  } else {
    await writeFile(tmp, data)
  }
  await rename(tmp, path)
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

  const tmpFilesToClean: string[] = []

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

      const wavPath = store.chapterWavPath(bookId, n)
      await synthesizeChapter(narration, opts.voiceId, opts.speed, wavPath, abortSignal)

      if (abortSignal.aborted) throw new Error('Audiobook generation aborted')

      // Per-chapter MP3 (96 kbps). This is what the per-chapter Listen button
      // streams. We write to the final mp3 path directly (with a .tmp swap).
      const mp3Path = store.chapterAudioPath(bookId, n)
      const mp3Tmp = mp3Path + '.tmp'
      tmpFilesToClean.push(mp3Tmp)
      // -f mp3 is required because the tmp path ends in ".mp3.tmp" — ffmpeg
      // infers container format from the output extension and would otherwise
      // fail with "Unable to choose an output format for ...mp3.tmp".
      await runFfmpeg(
        [
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', wavPath,
          '-c:a', 'libmp3lame',
          '-b:a', MP3_BITRATE,
          '-ac', '1',
          '-ar', '22050',
          '-f', 'mp3',
          mp3Tmp,
        ],
        abortSignal,
      )
      await rename(mp3Tmp, mp3Path)

      // Mark this chapter as audio-ready so the UI's Listen button can light
      // up before the full M4B stitch completes. Re-read meta in case it
      // changed (e.g., user edited tags concurrently).
      const meta = await store.getBook(bookId)
      if (!meta.audioGeneratedChapters.includes(n)) {
        meta.audioGeneratedChapters = [...meta.audioGeneratedChapters, n]
      }
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)

      updateProgress(taskId, n, `Narrated chapter ${n} of ${totalChapters}`)
    }

    if (abortSignal.aborted) throw new Error('Audiobook generation aborted')

    // 6. Stitch phase: probe durations, build metadata + concat list, run ffmpeg.
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

    // Build chapter metadata (milliseconds).
    const chaptersForMeta = chapterEntries.map((c) => ({
      title: `Chapter ${c.num}: ${c.title}`,
      startMs: Math.round(c.startSec * 1000),
      endMs: Math.round((c.startSec + c.durationSec) * 1000),
    }))
    const ffmetadataText = buildFfmetadata(finalMeta.title, chaptersForMeta)

    // Write tmp helper files outside the book dir so a failed run doesn't
    // pollute the audio dir. Tag them with a uuid for parallel-safety.
    const runId = randomUUID()
    const concatListPath = join(tmpdir(), `tutor-audiobook-concat-${runId}.txt`)
    const ffmetadataPath = join(tmpdir(), `tutor-audiobook-meta-${runId}.txt`)
    tmpFilesToClean.push(concatListPath, ffmetadataPath)

    const concatList = buildConcatList(
      Array.from({ length: totalChapters }, (_, i) => store.chapterWavPath(bookId, i + 1)),
    )
    await writeAtomic(concatListPath, concatList)
    await writeAtomic(ffmetadataPath, ffmetadataText)

    const m4bPath = store.audiobookPath(bookId)
    const m4bTmp = m4bPath + '.tmp'
    tmpFilesToClean.push(m4bTmp)

    const coverPath = await store.getCoverPath(bookId)

    // Build args for stitching. Concat demuxer = input 0; metadata = input 1;
    // cover (if present) = input 2. The cover path embeds it as attached_pic;
    // we force yuvj420p because PNG covers commonly arrive as RGBA which the
    // mjpeg encoder otherwise refuses.
    function buildStitchArgs(withCover: boolean): string[] {
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-i', ffmetadataPath,
      ]
      if (withCover && coverPath) {
        args.push('-i', coverPath)
        args.push(
          '-map', '0:a',
          '-map', '2:v',
          '-map_metadata', '1',
          '-c:a', 'aac',
          '-b:a', M4B_BITRATE,
          '-c:v', 'mjpeg',
          '-pix_fmt', 'yuvj420p',
          '-disposition:v:0', 'attached_pic',
        )
      } else {
        args.push(
          '-map', '0:a',
          '-map_metadata', '1',
          '-c:a', 'aac',
          '-b:a', M4B_BITRATE,
        )
      }
      args.push(
        '-metadata', `title=${finalMeta.title}`,
        '-metadata', 'artist=Tutor',
        '-metadata', 'genre=Audiobook',
        '-f', 'mp4',
        m4bTmp,
      )
      return args
    }

    try {
      await runFfmpeg(buildStitchArgs(true), abortSignal)
    } catch (err) {
      // Cover-embedding is the most fragile step (varied PNG formats,
      // alpha channels, oversized images). Fall back to a cover-less M4B
      // so the user at least gets the audiobook -- they can re-embed
      // the cover from any audiobook app later.
      if (coverPath && !abortSignal.aborted) {
        console.warn(`[audiobook-generator] M4B stitch with cover failed for ${bookId}; retrying without cover. Reason: ${err instanceof Error ? err.message : String(err)}`)
        await runFfmpeg(buildStitchArgs(false), abortSignal)
      } else {
        throw err
      }
    }
    await rename(m4bTmp, m4bPath)

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

    // 9. Cleanup tmp helper files.
    for (const p of tmpFilesToClean) {
      if (existsSync(p)) await tryRm(p)
    }

    console.log(`[audiobook-generator] Completed audiobook for book ${bookId} -> ${m4bPath}`)

    // 10. Mark the task done. Caller already created the task with total=N+1
    // (narration + 1 stitch tick), but we conservatively pass the final path.
    completeTask(taskId, { path: m4bPath })
  } finally {
    // Always release the worker pool slot count so subsequent generations get
    // a fresh concurrency setting (the underlying TTS instance is reused).
    await stopWorkerPool()
    // Best-effort tmp cleanup even on the error path.
    for (const p of tmpFilesToClean) {
      if (existsSync(p)) await tryRm(p)
    }
  }
}
