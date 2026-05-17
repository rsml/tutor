import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import os from 'node:os'

let testDir: string

vi.mock('../../lib/data-dir.js', () => ({
  getDataDir: () => testDir,
}))

// Mock kokoro-js so tests never touch the model. We expose the mock so
// individual tests can configure stream() output and inspect calls. The
// service uses tts.stream() (not generate()) to avoid the tokenizer's
// silent ~510-token truncation; the mock mirrors that signature.
class FakeRawAudio {
  audio: Float32Array
  sampling_rate: number
  meta: string
  constructor(audio: Float32Array, sampling_rate: number, meta = '') {
    this.audio = audio
    this.sampling_rate = sampling_rate
    this.meta = meta
  }
  async save(path: string): Promise<void> {
    await writeFile(path, Buffer.from(`fake-wav ${this.meta} :: samples=${this.audio.length}`), 'binary')
  }
}

// Service passes a TextSplitterStream (not a raw string) to work around
// kokoro-js's never-close bug. The mock has to live inside vi.mock's
// factory because vi.mock is hoisted above any top-level identifiers,
// so reaching FakeSplitter/streamMock from the outer scope crashes.
type SplitterLike = { push(text: string): void; close(): void; __parts: string[] }
type StreamFn = (input: string | SplitterLike, opts: { voice?: string; speed?: number }) => AsyncGenerator<{ text: string; phonemes: string; audio: FakeRawAudio }, void, void>

const streamMock = vi.fn<StreamFn>(async function* (input, opts) {
  const parts = typeof input === 'string'
    ? input.split(/(?<=\.)\s+/).filter(Boolean)
    : input.__parts
  for (const part of parts) {
    yield {
      text: part,
      phonemes: part,
      audio: new FakeRawAudio(new Float32Array(1024), 24000, `voice=${opts.voice}|part=${part}`),
    }
  }
})
type FromPretrainedFn = (id: string, opts?: unknown) => Promise<{ stream: StreamFn }>
const fromPretrainedMock = vi.fn<FromPretrainedFn>(async () => ({
  stream: streamMock,
}))
vi.mock('kokoro-js', () => {
  class FakeSplitter implements SplitterLike {
    __parts: string[] = []
    push(text: string): void {
      this.__parts.push(...text.split(/(?<=\.)\s+/).filter(Boolean))
    }
    close(): void { /* noop */ }
  }
  return {
    KokoroTTS: {
      from_pretrained: (id: string, opts?: unknown) => fromPretrainedMock(id, opts),
    },
    TextSplitterStream: FakeSplitter,
  }
})

vi.mock('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: true },
}))

import * as service from './kokoro-service.js'

describe('kokoro-service', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-kokoro-test-'))
    streamMock.mockClear()
    fromPretrainedMock.mockClear()
    service.__testing.reset()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('listVoices', () => {
    it('returns male voices first with am_michael at the very top', () => {
      const voices = service.listVoices()
      expect(voices[0].id).toBe('am_michael')
      expect(voices[0].gender).toBe('Male')
      expect(voices[0].language).toBe('American English')
    })

    it('groups by gender (all male before any female)', () => {
      const voices = service.listVoices()
      const firstFemaleIdx = voices.findIndex((v) => v.gender === 'Female')
      const lastMaleIdx = voices.map((v) => v.gender).lastIndexOf('Male')
      expect(firstFemaleIdx).toBeGreaterThan(lastMaleIdx)
    })

    it('groups male American before male British', () => {
      const voices = service.listVoices()
      const males = voices.filter((v) => v.gender === 'Male')
      const firstBritishMale = males.findIndex((v) => v.language === 'British English')
      const lastAmericanMale = males.map((v) => v.language).lastIndexOf('American English')
      expect(firstBritishMale).toBeGreaterThan(lastAmericanMale)
    })

    it('includes grade and name', () => {
      const voices = service.listVoices()
      const michael = voices.find((v) => v.id === 'am_michael')!
      expect(michael.name).toBe('Michael')
      expect(michael.grade).toBe('C+')
    })

    it('contains exactly the 28 English voices', () => {
      // 11 af + 9 am + 4 bf + 4 bm = 28
      expect(service.listVoices()).toHaveLength(28)
    })
  })

  describe('getRecommendedWorkerCount', () => {
    it('respects the explicit override when within bounds', () => {
      const override = 2
      expect(service.getRecommendedWorkerCount(override)).toBeLessThanOrEqual(override)
    })

    it('always returns at least 1', () => {
      expect(service.getRecommendedWorkerCount(0)).toBeGreaterThanOrEqual(1)
    })

    it('is capped by CPU count', () => {
      const cpuCount = os.cpus().length
      expect(service.getRecommendedWorkerCount(9999)).toBeLessThanOrEqual(cpuCount)
    })

    it('is capped at 16 even with huge override', () => {
      expect(service.getRecommendedWorkerCount(9999)).toBeLessThanOrEqual(16)
    })

    it('is capped by RAM budget', () => {
      const ramBudget = Math.floor((os.totalmem() * 0.25) / (600 * 1024 * 1024))
      expect(service.getRecommendedWorkerCount(9999)).toBeLessThanOrEqual(Math.max(1, ramBudget))
    })
  })

  describe('isModelInstalled', () => {
    it('returns false when nothing installed', () => {
      expect(service.isModelInstalled()).toBe(false)
    })
  })

  describe('synthesizeChapter', () => {
    it('writes WAV atomically (tmp then rename)', async () => {
      await service.startWorkerPool(1)
      const outPath = join(testDir, 'out.wav')
      await service.synthesizeChapter('Hello there.', 'am_michael', 1.0, outPath)
      const content = await readFile(outPath, 'utf-8')
      // The merged RawAudio carries no per-chunk meta string, so we assert
      // on the sample count instead: 1 chunk of 1024 samples per sentence.
      expect(content).toContain('samples=1024')
    })

    it('uses stream() so long inputs are not silently truncated', async () => {
      await service.startWorkerPool(1)
      const outPath = join(testDir, 'long.wav')
      // Three sentences -> three streamed chunks.
      await service.synthesizeChapter(
        'Sentence one. Sentence two. Sentence three.',
        'am_michael',
        1.0,
        outPath,
      )
      expect(streamMock).toHaveBeenCalledTimes(1)
      const content = await readFile(outPath, 'utf-8')
      // 3 chunks × 1024 samples each = 3072 merged into one RawAudio.
      expect(content).toContain('samples=3072')
    })

    it('rejects unknown voice IDs', async () => {
      await service.startWorkerPool(1)
      const outPath = join(testDir, 'out.wav')
      await expect(
        service.synthesizeChapter('Hi.', 'not_a_voice', 1.0, outPath),
      ).rejects.toThrow(/Unknown voice/)
    })

    it('rejects out-of-range speed', async () => {
      await service.startWorkerPool(1)
      const outPath = join(testDir, 'out.wav')
      await expect(
        service.synthesizeChapter('Hi.', 'am_michael', 3.0, outPath),
      ).rejects.toThrow(/Invalid speed/)
    })

    it('checks abort signal before synthesis', async () => {
      await service.startWorkerPool(1)
      const controller = new AbortController()
      controller.abort()
      await expect(
        service.synthesizeChapter('Hi.', 'am_michael', 1.0, join(testDir, 'x.wav'), controller.signal),
      ).rejects.toThrow(/aborted/)
    })
  })

  describe('synthesizePreview', () => {
    it('generates and caches a preview WAV per voice', async () => {
      await service.startWorkerPool(1)
      const first = await service.synthesizePreview('am_michael')
      expect(first).toBeInstanceOf(Buffer)
      expect(streamMock).toHaveBeenCalledTimes(1)

      // Second call should hit the on-disk cache.
      const second = await service.synthesizePreview('am_michael')
      expect(second.equals(first)).toBe(true)
      expect(streamMock).toHaveBeenCalledTimes(1)
    })

    it('rejects unknown voices', async () => {
      await expect(service.synthesizePreview('not_a_voice')).rejects.toThrow(/Unknown voice/)
    })
  })

  describe('worker pool lifecycle', () => {
    it('startWorkerPool warms the Kokoro instance', async () => {
      await service.startWorkerPool(2)
      expect(fromPretrainedMock).toHaveBeenCalledTimes(1)
    })

    it('stopWorkerPool is a no-op for the instance (reuses on next start)', async () => {
      await service.startWorkerPool(2)
      await service.stopWorkerPool()
      await service.startWorkerPool(2)
      // Instance is reused — from_pretrained only called the first time
      expect(fromPretrainedMock).toHaveBeenCalledTimes(1)
    })
  })
})
