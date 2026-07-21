import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AudiobookChapterEntry } from '@shared/domain.js'
import { createFfmpegAudioAssembly, type ExecFileRunner, type ExecFileErrorLike } from './ffmpeg-audio-assembly.js'

// These tests never spawn ffmpeg (or anything else). Every scenario injects
// a fake execFile that records the exact (file, args) it would have been
// called with and hands control back to the test — see createFakeExecFile
// below. Real ffmpeg and a real kokoro model are both unavailable in CI,
// which is exactly why the port's own contract (describeAudioAssemblyContract)
// is fake-only; this file exists to give the real adapter's argv-building
// logic hermetic coverage that the contract deliberately can't.

interface FakeExecFileResult {
  /** ffmpeg's stderr for this call, e.g. a "Duration: ..." line. */
  stderr?: string
  /** When set, the fake calls back with this error instead of succeeding. */
  error?: ExecFileErrorLike
  /** Runs immediately before the callback fires — lets a test flip the AbortSignal to aborted at the exact moment a real execFile's internal kill would, before the adapter's catch block inspects signal.aborted. */
  onBeforeCallback?: () => void
}

interface FakeExecFileCall {
  file: string
  args: readonly string[]
  /** Contents of any '-i <path>' argument that existed on disk at call time (the concat list and FFMETADATA1 files the adapter just wrote), captured before the adapter's own cleanup can delete them. */
  snapshots: Record<string, string>
}

function createFakeExecFile(results: FakeExecFileResult[]): { fn: ExecFileRunner; calls: FakeExecFileCall[] } {
  const calls: FakeExecFileCall[] = []
  let callIndex = 0

  const fn: ExecFileRunner = (file, args, _options, callback) => {
    const snapshots: Record<string, string> = {}
    args.forEach((arg, idx) => {
      if (args[idx - 1] === '-i' && existsSync(arg)) {
        snapshots[arg] = readFileSync(arg, 'utf-8')
      }
    })
    calls.push({ file, args: [...args], snapshots })

    const result = results[Math.min(callIndex, results.length - 1)]
    callIndex++
    result.onBeforeCallback?.()

    if (result.error) {
      callback(result.error, '', result.stderr ?? '')
      return
    }
    // Mirror real ffmpeg leaving its output file behind on success, so the
    // adapter's own rename(m4bTmp, out) has something to rename. The
    // duration-probe command writes to stdout ('-'), not a file.
    const outPath = args[args.length - 1]
    if (outPath !== '-') {
      writeFileSync(outPath, 'fake-m4b-bytes')
    }
    callback(null, '', result.stderr ?? '')
  }

  return { fn, calls }
}

function indicesOf(args: readonly string[], flag: string): number[] {
  return args.reduce<number[]>((acc, a, idx) => (a === flag ? [...acc, idx] : acc), [])
}

describe('ffmpeg-audio-assembly', () => {
  let testDir: string

  const chapters: AudiobookChapterEntry[] = [
    { num: 1, title: 'Chapter 1: Origins', mp3Path: '/fake/audio/01.mp3', durationSec: 10, startSec: 0 },
    { num: 2, title: 'Chapter 2: The Middle', mp3Path: '/fake/audio/02.mp3', durationSec: 12.5, startSec: 10 },
  ]

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-ffmpeg-adapter-test-'))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('probeDurationSec', () => {
    it('parses seconds from the Duration line ffmpeg emits on stderr', async () => {
      const { fn, calls } = createFakeExecFile([{ stderr: 'Duration: 00:01:23.45, start: 0.000000, bitrate: 96 kb/s' }])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()

      const sec = await adapter.probeDurationSec('/fake/audio/01.wav', controller.signal)

      expect(sec).toBeCloseTo(83.45, 2)
      expect(calls).toHaveLength(1)
      expect(calls[0].args).toEqual(['-hide_banner', '-i', '/fake/audio/01.wav', '-f', 'null', '-'])
    })

    it('rejects when the signal is already aborted, without invoking the process runner', async () => {
      const { fn, calls } = createFakeExecFile([])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()
      controller.abort()

      await expect(adapter.probeDurationSec('/fake/audio/01.wav', controller.signal)).rejects.toThrow(/abort/i)
      expect(calls).toHaveLength(0)
    })

    it('rejects when ffmpeg output has no parseable Duration line', async () => {
      const { fn } = createFakeExecFile([{ stderr: 'no duration in here' }])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()

      await expect(adapter.probeDurationSec('/fake/audio/01.wav', controller.signal)).rejects.toThrow(/Could not parse duration/)
    })
  })

  describe('concatToM4b', () => {
    it('rejects when the signal is already aborted, without invoking the process runner', async () => {
      const { fn, calls } = createFakeExecFile([])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()
      controller.abort()

      await expect(
        adapter.concatToM4b({
          inputs: ['/fake/audio/01.wav'],
          chapters,
          out: join(testDir, 'aborted.m4b'),
          bitrate: '64k',
          signal: controller.signal,
        }),
      ).rejects.toThrow(/abort/i)
      expect(calls).toHaveLength(0)
    })

    it('writes the concat list and FFMETADATA1 files, and stitches without cover flags, for a request without a cover', async () => {
      const { fn, calls } = createFakeExecFile([{ stderr: '' }])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()
      const out = join(testDir, 'book.m4b')

      await adapter.concatToM4b({
        inputs: ['/fake/audio/01.wav', '/fake/audio/02.wav'],
        chapters,
        out,
        bitrate: '64k',
        bookTitle: 'Test Audiobook',
        signal: controller.signal,
      })

      expect(calls).toHaveLength(1)
      const args = calls[0].args

      // concat demuxer + metadata inputs, in the documented order.
      expect(args.slice(0, 8)).toEqual(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0'])
      const [concatIdx, metaIdx] = indicesOf(args, '-i')
      expect(metaIdx).toBeGreaterThan(concatIdx)
      const concatListPath = args[concatIdx + 1]
      const ffmetadataPath = args[metaIdx + 1]

      // No cover was requested, so there is no third -i and no video mapping.
      expect(indicesOf(args, '-i')).toHaveLength(2)
      expect(args).not.toContain('attached_pic')
      expect(args).toEqual(expect.arrayContaining(['-map', '0:a', '-map_metadata', '1', '-c:a', 'aac', '-b:a', '64k']))
      expect(args).toEqual(expect.arrayContaining(['-metadata', 'title=Test Audiobook', '-metadata', 'album=Test Audiobook']))
      expect(args).toEqual(expect.arrayContaining(['-metadata', 'artist=Tutor', '-metadata', 'genre=Audiobook', '-metadata', 'media_type=2']))
      expect(args[args.length - 1]).toBe(out + '.tmp')

      // Concat list: one quoted 'file' line per input, in order.
      expect(calls[0].snapshots[concatListPath]).toBe(
        "file '/fake/audio/01.wav'\nfile '/fake/audio/02.wav'",
      )

      // FFMETADATA1: top-level title plus one [CHAPTER] block per chapter,
      // with start/end converted to milliseconds.
      const ffmetadata = calls[0].snapshots[ffmetadataPath]
      expect(ffmetadata.startsWith(';FFMETADATA1\n')).toBe(true)
      expect(ffmetadata).toContain('title=Test Audiobook')
      expect(ffmetadata).toContain('artist=Tutor')
      expect(ffmetadata).toContain('genre=Audiobook')
      expect(ffmetadata).toContain('[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=10000\ntitle=Chapter 1: Origins')
      expect(ffmetadata).toContain('[CHAPTER]\nTIMEBASE=1/1000\nSTART=10000\nEND=22500\ntitle=Chapter 2: The Middle')

      // The finished M4B lands at the requested path (tmp renamed into place).
      expect(existsSync(out)).toBe(true)
    })

    it('omits the title/album tags and FFMETADATA1 title line when no bookTitle is given', async () => {
      const { fn, calls } = createFakeExecFile([{ stderr: '' }])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()

      await adapter.concatToM4b({
        inputs: ['/fake/audio/01.wav'],
        chapters: [chapters[0]],
        out: join(testDir, 'book.m4b'),
        bitrate: '64k',
        signal: controller.signal,
      })

      const args = calls[0].args
      expect(args.some((a) => a.startsWith('title='))).toBe(false)
      const [, metaIdx] = indicesOf(args, '-i')
      const ffmetadataPath = args[metaIdx + 1]
      expect(calls[0].snapshots[ffmetadataPath]).not.toContain('title=Test')
      expect(calls[0].snapshots[ffmetadataPath].startsWith(';FFMETADATA1\nartist=Tutor')).toBe(true)
    })

    it('embeds the cover and maps its video stream when coverPath is given', async () => {
      const { fn, calls } = createFakeExecFile([{ stderr: '' }])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()

      await adapter.concatToM4b({
        inputs: ['/fake/audio/01.wav'],
        chapters,
        out: join(testDir, 'book.m4b'),
        bitrate: '96k',
        coverPath: '/fake/covers/book.png',
        signal: controller.signal,
      })

      expect(calls).toHaveLength(1)
      const args = calls[0].args
      expect(indicesOf(args, '-i')).toHaveLength(3)
      expect(args).toContain('/fake/covers/book.png')
      expect(args).toEqual(expect.arrayContaining([
        '-map', '0:a', '-map', '2:v', '-map_metadata', '1',
        '-c:a', 'aac', '-b:a', '96k',
        '-c:v', 'mjpeg', '-pix_fmt', 'yuvj420p',
        '-disposition:v:0', 'attached_pic',
      ]))
    })

    it('retries coverless when the cover-embedding attempt fails, and still produces the M4B', async () => {
      const embedFailure = Object.assign(new Error('mjpeg encoder rejected input'), { code: 1 })
      const { fn, calls } = createFakeExecFile([
        { error: embedFailure },
        { stderr: '' },
      ])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()
      const out = join(testDir, 'book.m4b')

      await adapter.concatToM4b({
        inputs: ['/fake/audio/01.wav'],
        chapters,
        out,
        bitrate: '64k',
        coverPath: '/fake/covers/book.png',
        signal: controller.signal,
      })

      expect(calls).toHaveLength(2)
      expect(calls[0].args).toContain('/fake/covers/book.png')
      expect(calls[0].args).toContain('attached_pic')
      // The retry drops every cover-related flag — callers can't tell the
      // difference between "no cover requested" and "cover failed".
      expect(calls[1].args).not.toContain('/fake/covers/book.png')
      expect(calls[1].args).not.toContain('attached_pic')
      expect(indicesOf(calls[1].args, '-i')).toHaveLength(2)
      expect(existsSync(out)).toBe(true)
    })

    it('propagates an abort instead of retrying, even when a cover was requested', async () => {
      const controller = new AbortController()
      const abortError = Object.assign(new Error('The operation was aborted'), { code: 'ABORT_ERR' })
      const { fn, calls } = createFakeExecFile([
        {
          error: abortError,
          // Simulate what a real execFile does: the AbortSignal fires (and
          // is observably .aborted) before the callback delivers the abort error.
          onBeforeCallback: () => controller.abort(),
        },
      ])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })

      await expect(
        adapter.concatToM4b({
          inputs: ['/fake/audio/01.wav'],
          chapters,
          out: join(testDir, 'book.m4b'),
          bitrate: '64k',
          coverPath: '/fake/covers/book.png',
          signal: controller.signal,
        }),
      ).rejects.toThrow(/abort/i)

      // No coverless retry attempted — an abort propagates as-is.
      expect(calls).toHaveLength(1)
    })

    it('cleans up its tmp concat list and FFMETADATA1 files after finishing', async () => {
      const { fn, calls } = createFakeExecFile([{ stderr: '' }])
      const adapter = createFfmpegAudioAssembly({ execFile: fn })
      const controller = new AbortController()

      await adapter.concatToM4b({
        inputs: ['/fake/audio/01.wav'],
        chapters,
        out: join(testDir, 'book.m4b'),
        bitrate: '64k',
        signal: controller.signal,
      })

      const [concatIdx, metaIdx] = indicesOf(calls[0].args, '-i')
      expect(existsSync(calls[0].args[concatIdx + 1])).toBe(false)
      expect(existsSync(calls[0].args[metaIdx + 1])).toBe(false)
    })
  })
})
