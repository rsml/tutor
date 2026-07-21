import { execFile as nodeExecFile } from 'node:child_process'
import { writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { AudiobookChapterEntry } from '@shared/domain.js'
import type { AudioAssembly, ConcatToM4bRequest } from '../ports/audio-assembly.js'
import { getFfmpegPath } from '../services/audiobook-installer.js'

/**
 * ffmpeg backed AudioAssembly. Real logic lifted verbatim from the ffmpeg
 * internals of server/services/audiobook-generator.ts: runFfmpeg,
 * getAudioDurationSec (now probeDurationSec), and the M4B stitch step
 * (buildFfmetadata, buildConcatList, writeAtomic, buildStitchArgs, and the
 * cover-embed-then-retry logic) inside generateAudiobook. See that file's
 * git history for the pre-extraction shape.
 *
 * Cover embedding is best-effort resilience, not a caller-visible choice.
 * concatToM4b always attempts to embed req.coverPath (when given) on its
 * first ffmpeg invocation. If that invocation fails for any reason, and
 * the signal isn't the reason (an abort should propagate, not retry), it
 * retries once with the exact same args minus the cover-related flags,
 * producing a coverless M4B instead of rejecting. Callers never see the
 * difference between "no cover was requested" and "a cover was requested
 * but couldn't be embedded" — both produce a finished M4B.
 */
/** The subset of a failed execFile's error that runFfmpeg actually reads. Node's own ExecFileException types `code` as `string | number | null | undefined`, which this mirrors instead of the narrower NodeJS.ErrnoException. */
export type ExecFileErrorLike = Error & { code?: string | number | null }

/**
 * The exact shape of node:child_process's execFile this adapter calls
 * through. Narrower than execFile's own overloaded signature, so a fake in
 * a test is trivial to write and typecheck against.
 */
export interface ExecFileRunner {
  (
    file: string,
    args: readonly string[],
    options: { signal: AbortSignal; maxBuffer?: number },
    callback: (error: ExecFileErrorLike | null, stdout: string, stderr: string) => void,
  ): void
}

/**
 * Constructor deps for createFfmpegAudioAssembly. execFile is the only
 * field, overridden in tests so a suite can assert the exact argv ffmpeg
 * would have received without spawning a real process.
 */
export interface FfmpegAudioAssemblyDeps {
  /**
   * Runs the ffmpeg binary and resolves its stdout/stderr, or rejects on a
   * non-zero exit or an aborted signal. Defaults to a thin wrapper over
   * node:child_process's execFile. Overridable so tests can capture the
   * argument vectors ffmpeg would have received without spawning anything.
   */
  execFile?: ExecFileRunner
}

const ABORTED_MESSAGE = 'Audiobook generation aborted'

// Node's execFile is happy to accept a wider callback (stdout/stderr can be
// Buffer when an encoding option isn't set), so this wrapper normalizes both
// to string, matching what runFfmpeg has always expected.
function defaultExecFile(
  file: string,
  args: readonly string[],
  options: { signal: AbortSignal; maxBuffer?: number },
  callback: (error: ExecFileErrorLike | null, stdout: string, stderr: string) => void,
): void {
  nodeExecFile(file, args as string[], options, (err, stdout, stderr) => {
    callback(err, String(stdout), String(stderr))
  })
}

// FFMETADATA1 requires escaping =, ;, #, \, and newlines with a leading backslash.
function escapeMeta(value: string): string {
  return value.replace(/[\\=;#\n]/g, (c) => (c === '\n' ? '\\\n' : `\\${c}`))
}

// Build the FFMETADATA1 file ffmpeg uses to write chapter markers into the M4B.
// TIMEBASE=1/1000 means START/END are in milliseconds.
function buildFfmetadata(bookTitle: string | undefined, chapters: AudiobookChapterEntry[]): string {
  const lines: string[] = [';FFMETADATA1']
  if (bookTitle !== undefined) {
    lines.push(`title=${escapeMeta(bookTitle)}`)
  }
  lines.push('artist=Tutor')
  lines.push('genre=Audiobook')
  lines.push('')
  for (const ch of chapters) {
    const startMs = Math.round(ch.startSec * 1000)
    const endMs = Math.round((ch.startSec + ch.durationSec) * 1000)
    lines.push('[CHAPTER]')
    lines.push('TIMEBASE=1/1000')
    lines.push(`START=${startMs}`)
    lines.push(`END=${endMs}`)
    lines.push(`title=${escapeMeta(ch.title)}`)
    lines.push('')
  }
  return lines.join('\n')
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

/**
 * Factory for the AudioAssembly port. Every filesystem path it touches
 * outside of req.inputs and req.out is a tmp file scoped to one
 * concatToM4b call, tagged with a fresh uuid so two concurrent stitches
 * never collide, and removed in a finally regardless of success, cover
 * fallback, or abort.
 */
export function createFfmpegAudioAssembly(deps: FfmpegAudioAssemblyDeps = {}): AudioAssembly {
  const runExecFile = deps.execFile ?? defaultExecFile

  // Run ffmpeg with the configured binary, surfacing stderr on non-zero exit.
  // The AbortSignal kills hung processes (e.g., long stitches cancelled by
  // the user).
  async function runFfmpeg(args: string[], signal: AbortSignal): Promise<{ stdout: string; stderr: string }> {
    if (signal.aborted) throw new Error(ABORTED_MESSAGE)
    const ffmpegPath = getFfmpegPath()
    return new Promise((resolve, reject) => {
      runExecFile(
        ffmpegPath,
        args,
        // maxBuffer: ffmpeg's stderr can balloon over a multi-minute stitch.
        { signal, maxBuffer: 32 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const code = err.code
            if (code === 'ABORT_ERR' || signal.aborted) {
              reject(new Error(ABORTED_MESSAGE))
              return
            }
            reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`))
            return
          }
          resolve({ stdout, stderr })
        },
      )
    })
  }

  return {
    // Probe an audio file's duration using ffmpeg's "-i ... -f null -" stderr
    // output. We don't ship ffprobe (the evermeet.cx ffmpeg-only zip), so we
    // parse the human-readable "Duration: HH:MM:SS.ss" line ffmpeg always emits.
    async probeDurationSec(path: string, signal: AbortSignal): Promise<number> {
      const { stderr } = await runFfmpeg(['-hide_banner', '-i', path, '-f', 'null', '-'], signal)
      const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
      if (!match) {
        throw new Error(`Could not parse duration from ffmpeg output for ${path}`)
      }
      const h = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      const s = parseFloat(match[3])
      return h * 3600 + m * 60 + s
    },

    async concatToM4b(req: ConcatToM4bRequest): Promise<void> {
      if (req.signal.aborted) throw new Error(ABORTED_MESSAGE)

      // Write tmp helper files outside the destination dir so a failed run
      // doesn't pollute it. Tag them with a uuid for parallel-safety.
      const runId = randomUUID()
      const concatListPath = join(tmpdir(), `tutor-audiobook-concat-${runId}.txt`)
      const ffmetadataPath = join(tmpdir(), `tutor-audiobook-meta-${runId}.txt`)
      const m4bTmp = req.out + '.tmp'

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
        if (withCover && req.coverPath) {
          args.push('-i', req.coverPath)
          args.push(
            '-map', '0:a',
            '-map', '2:v',
            '-map_metadata', '1',
            '-c:a', 'aac',
            '-b:a', req.bitrate,
            '-c:v', 'mjpeg',
            '-pix_fmt', 'yuvj420p',
            '-disposition:v:0', 'attached_pic',
          )
        } else {
          args.push(
            '-map', '0:a',
            '-map_metadata', '1',
            '-c:a', 'aac',
            '-b:a', req.bitrate,
          )
        }
        if (req.bookTitle !== undefined) {
          args.push('-metadata', `title=${req.bookTitle}`, '-metadata', `album=${req.bookTitle}`)
        }
        args.push(
          '-metadata', 'artist=Tutor',
          '-metadata', 'album_artist=Tutor',
          '-metadata', 'genre=Audiobook',
          // media_type=2 = "Audiobook" iTunes stik value. Without it, Apple
          // Books treats the file as music and won't show chapter navigation
          // the way it does for native audiobooks.
          '-metadata', 'media_type=2',
          // +faststart moves the moov atom to the front of the file so
          // streaming clients (the in-app <audio> element, Apple Books)
          // can begin playback before the whole file downloads.
          '-movflags', '+faststart',
          '-f', 'mp4',
          m4bTmp,
        )
        return args
      }

      try {
        const ffmetadataText = buildFfmetadata(req.bookTitle, req.chapters)
        const concatList = buildConcatList(req.inputs)
        await writeAtomic(concatListPath, concatList)
        await writeAtomic(ffmetadataPath, ffmetadataText)

        try {
          await runFfmpeg(buildStitchArgs(true), req.signal)
        } catch (err) {
          // Cover-embedding is the most fragile step (varied PNG formats,
          // alpha channels, oversized images). Fall back to a cover-less M4B
          // so the caller at least gets the audiobook — a cover can be
          // re-embedded from any audiobook app later. An abort is never
          // retried, it propagates as-is.
          if (req.coverPath && !req.signal.aborted) {
            console.warn(`[ffmpeg-audio-assembly] M4B stitch with cover failed for ${req.out}; retrying without cover. Reason: ${err instanceof Error ? err.message : String(err)}`)
            await runFfmpeg(buildStitchArgs(false), req.signal)
          } else {
            throw err
          }
        }

        await rename(m4bTmp, req.out)
      } finally {
        await tryRm(concatListPath)
        await tryRm(ffmetadataPath)
        if (existsSync(m4bTmp)) await tryRm(m4bTmp)
      }
    },
  }
}
