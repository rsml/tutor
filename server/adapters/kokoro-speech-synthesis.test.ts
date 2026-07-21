import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// This file never loads the real Kokoro model. kokoro-js and
// @huggingface/transformers are mocked so importing this adapter can never
// trigger a real model download or onnxruntime init, no matter which test
// runs. streamMock actually yields fake audio chunks (rather than a bare
// vi.fn()) because the synthesizeChapter/synthesizePreview tests below need
// to drive real chunking, sentence-splitting, and WAV-writing behaviour, not
// just prove from_pretrained was called.
let testDir: string

vi.mock('@shared/node/data-dir.js', () => ({
  getDataDir: () => testDir,
}))

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

// The adapter passes a TextSplitterStream (not a raw string) to work around
// kokoro-js's never-close bug. The mock has to live inside vi.mock's factory
// because vi.mock is hoisted above any top-level identifiers, so reaching
// FakeSplitter/streamMock from the outer scope crashes.
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

import { createKokoroSpeechSynthesis } from './kokoro-speech-synthesis.js'
import { MODEL_ID } from '../services/audiobook-installer.js'

describe('kokoro-speech-synthesis', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-kokoro-adapter-test-'))
    streamMock.mockClear()
    fromPretrainedMock.mockClear()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('listVoices', () => {
    it('returns male voices first with am_michael at the very top', () => {
      const adapter = createKokoroSpeechSynthesis()
      const voices = adapter.listVoices()
      expect(voices[0].id).toBe('am_michael')
      expect(voices[0].gender).toBe('Male')
      expect(voices[0].language).toBe('American English')
    })

    it('groups by gender (all male before any female)', () => {
      const adapter = createKokoroSpeechSynthesis()
      const voices = adapter.listVoices()
      const firstFemaleIdx = voices.findIndex((v) => v.gender === 'Female')
      const lastMaleIdx = voices.map((v) => v.gender).lastIndexOf('Male')
      expect(firstFemaleIdx).toBeGreaterThan(lastMaleIdx)
    })

    it('groups male American before male British', () => {
      const adapter = createKokoroSpeechSynthesis()
      const voices = adapter.listVoices()
      const males = voices.filter((v) => v.gender === 'Male')
      const firstBritishMale = males.findIndex((v) => v.language === 'British English')
      const lastAmericanMale = males.map((v) => v.language).lastIndexOf('American English')
      expect(firstBritishMale).toBeGreaterThan(lastAmericanMale)
    })

    it('includes grade and name', () => {
      const adapter = createKokoroSpeechSynthesis()
      const voices = adapter.listVoices()
      const michael = voices.find((v) => v.id === 'am_michael')!
      expect(michael.name).toBe('Michael')
      expect(michael.grade).toBe('C+')
    })

    it('contains exactly the 28 English voices', () => {
      const adapter = createKokoroSpeechSynthesis()
      // 11 af + 9 am + 4 bf + 4 bm = 28
      expect(adapter.listVoices()).toHaveLength(28)
    })

    it('gives every voice the documented fields', () => {
      const adapter = createKokoroSpeechSynthesis()
      for (const voice of adapter.listVoices()) {
        expect(typeof voice.id).toBe('string')
        expect(voice.id.length).toBeGreaterThan(0)
        expect(typeof voice.name).toBe('string')
        expect(['American English', 'British English']).toContain(voice.language)
        expect(['Male', 'Female']).toContain(voice.gender)
        expect(typeof voice.grade).toBe('string')
      }
    })

    it('never touches the Kokoro model loader just to list voices', () => {
      const adapter = createKokoroSpeechSynthesis()
      adapter.listVoices()
      expect(fromPretrainedMock).not.toHaveBeenCalled()
    })
  })

  describe('install surface', () => {
    it('delegates isInstalled, missingComponents, and install to injected deps', async () => {
      const isInstalled = vi.fn(() => true)
      const missingComponents = vi.fn(() => ({ model: false, ffmpeg: false, totalBytes: 0 }))
      const install = vi.fn(async () => {})
      const adapter = createKokoroSpeechSynthesis({ isInstalled, missingComponents, install })

      expect(adapter.isInstalled()).toBe(true)
      expect(isInstalled).toHaveBeenCalledOnce()

      expect(adapter.missingComponents()).toEqual({ model: false, ffmpeg: false, totalBytes: 0 })
      expect(missingComponents).toHaveBeenCalledOnce()

      const onProgress = vi.fn()
      const controller = new AbortController()
      await adapter.install(onProgress, controller.signal)
      expect(install).toHaveBeenCalledWith(onProgress, controller.signal)
    })

    it('defaults to the real audiobook-installer probes when nothing is injected', () => {
      // testDir (see beforeEach) is a fresh, empty temp directory, pointed
      // at by the data-dir mock above — never the real user data dir — so
      // this deterministically reports nothing installed regardless of
      // what's actually on the machine running the suite. This is also
      // former shim behaviour: kokoro-service.ts's isModelInstalled() forwarded
      // to exactly this same no-args adapter.isInstalled() call.
      const adapter = createKokoroSpeechSynthesis()
      expect(adapter.isInstalled()).toBe(false)
      const missing = adapter.missingComponents()
      expect(missing.model).toBe(true)
      expect(missing.ffmpeg).toBe(true)
      expect(missing.totalBytes).toBeGreaterThan(0)
    })

    it('reports installed once both the model and ffmpeg are present on disk', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      await writeFile(join(modelDir, 'model_q8.onnx'), Buffer.alloc(2 * 1024 * 1024))
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')

      const adapter = createKokoroSpeechSynthesis()
      expect(adapter.isInstalled()).toBe(true)
      expect(adapter.missingComponents()).toEqual({ model: false, ffmpeg: false, totalBytes: 0 })
    })
  })

  describe('construction', () => {
    it('gives each instance its own synthesis pool state, independent of other instances', async () => {
      const a = createKokoroSpeechSynthesis()
      const b = createKokoroSpeechSynthesis()

      await a.startWorkerPool(1)
      expect(fromPretrainedMock).toHaveBeenCalledTimes(1)

      // b has never warmed a model before, so it must load its own — this is
      // only true because worker-pool/TTS state lives in each factory call's
      // own closure, rather than a shared singleton.
      await b.startWorkerPool(1)
      expect(fromPretrainedMock).toHaveBeenCalledTimes(2)
    })

    it('does not eagerly load the model just from being constructed', () => {
      createKokoroSpeechSynthesis()
      expect(fromPretrainedMock).not.toHaveBeenCalled()
    })
  })

  describe('worker pool lifecycle', () => {
    it('startWorkerPool warms the Kokoro instance', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(2)
      expect(fromPretrainedMock).toHaveBeenCalledTimes(1)
    })

    it('stopWorkerPool is a no-op for the instance (reuses on next start)', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(2)
      await adapter.stopWorkerPool()
      await adapter.startWorkerPool(2)
      // Instance is reused — from_pretrained only called the first time
      expect(fromPretrainedMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('synthesizeChapter', () => {
    it('writes WAV atomically (tmp then rename)', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(1)
      const outPath = join(testDir, 'out.wav')
      await adapter.synthesizeChapter({ text: 'Hello there.', voiceId: 'am_michael', speed: 1.0, outPath })
      const content = await readFile(outPath, 'utf-8')
      // The merged RawAudio carries no per-chunk meta string, so we assert
      // on the sample count instead: 1 chunk of 1024 samples per sentence.
      expect(content).toContain('samples=1024')
    })

    it('uses stream() so long inputs are not silently truncated', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(1)
      const outPath = join(testDir, 'long.wav')
      // Three sentences -> three streamed chunks.
      await adapter.synthesizeChapter({
        text: 'Sentence one. Sentence two. Sentence three.',
        voiceId: 'am_michael',
        speed: 1.0,
        outPath,
      })
      expect(streamMock).toHaveBeenCalledTimes(1)
      const content = await readFile(outPath, 'utf-8')
      // 3 chunks × 1024 samples each = 3072 merged into one RawAudio.
      expect(content).toContain('samples=3072')
    })

    it('rejects unknown voice IDs', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(1)
      const outPath = join(testDir, 'out.wav')
      await expect(
        adapter.synthesizeChapter({ text: 'Hi.', voiceId: 'not_a_voice', speed: 1.0, outPath }),
      ).rejects.toThrow(/Unknown voice/)
    })

    it('rejects out-of-range speed', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(1)
      const outPath = join(testDir, 'out.wav')
      await expect(
        adapter.synthesizeChapter({ text: 'Hi.', voiceId: 'am_michael', speed: 3.0, outPath }),
      ).rejects.toThrow(/Invalid speed/)
    })

    it('checks abort signal before synthesis', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(1)
      const controller = new AbortController()
      controller.abort()
      await expect(
        adapter.synthesizeChapter({
          text: 'Hi.',
          voiceId: 'am_michael',
          speed: 1.0,
          outPath: join(testDir, 'x.wav'),
          signal: controller.signal,
        }),
      ).rejects.toThrow(/aborted/)
    })
  })

  describe('synthesizePreview', () => {
    it('generates and caches a preview WAV per voice', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await adapter.startWorkerPool(1)
      const first = await adapter.synthesizePreview('am_michael')
      expect(first).toBeInstanceOf(Buffer)
      expect(streamMock).toHaveBeenCalledTimes(1)

      // Second call should hit the on-disk cache.
      const second = await adapter.synthesizePreview('am_michael')
      expect(second.equals(first)).toBe(true)
      expect(streamMock).toHaveBeenCalledTimes(1)
    })

    it('rejects unknown voices', async () => {
      const adapter = createKokoroSpeechSynthesis()
      await expect(adapter.synthesizePreview('not_a_voice')).rejects.toThrow(/Unknown voice/)
    })
  })
})
