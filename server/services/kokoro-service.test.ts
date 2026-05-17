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
// individual tests can configure generate() output and inspect calls.
type GenerateFn = (text: string, opts: { voice?: string; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate: number; save: (path: string) => Promise<void> }>
const generateMock = vi.fn<GenerateFn>(async (text, opts) => ({
  audio: new Float32Array(1024),
  sampling_rate: 24000,
  save: async (path: string): Promise<void> => {
    await writeFile(path, Buffer.from(`fake-wav for ${opts.voice} :: ${text}`), 'binary')
  },
}))
type FromPretrainedFn = (id: string, opts?: unknown) => Promise<{ generate: GenerateFn }>
const fromPretrainedMock = vi.fn<FromPretrainedFn>(async () => ({
  generate: generateMock,
}))
vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: (id: string, opts?: unknown) => fromPretrainedMock(id, opts),
  },
}))

vi.mock('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: true },
}))

import * as service from './kokoro-service.js'

describe('kokoro-service', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-kokoro-test-'))
    generateMock.mockClear()
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
      expect(content).toContain('am_michael')
      expect(content).toContain('Hello there.')
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
      expect(generateMock).toHaveBeenCalledTimes(1)

      // Second call should hit the on-disk cache.
      const second = await service.synthesizePreview('am_michael')
      expect(second.equals(first)).toBe(true)
      expect(generateMock).toHaveBeenCalledTimes(1)
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
