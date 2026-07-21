import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// This file never loads the real Kokoro model. kokoro-js and
// @huggingface/transformers are mocked exactly the way
// kokoro-service.test.ts and audiobook-installer.test.ts already mock
// them, even though most tests below never reach synthesis at all — the
// goal is that importing this adapter can never trigger a real model
// download or onnxruntime init, no matter which test runs.
let testDir: string

vi.mock('@shared/node/data-dir.js', () => ({
  getDataDir: () => testDir,
}))

const mocks = vi.hoisted(() => ({
  fromPretrained: vi.fn(async (_id: string, _opts?: unknown) => ({ stream: vi.fn() })),
}))

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: (id: string, opts?: unknown) => mocks.fromPretrained(id, opts),
  },
  TextSplitterStream: class {
    push(): void { /* noop */ }
    close(): void { /* noop */ }
  },
}))

vi.mock('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: true },
}))

import { createKokoroSpeechSynthesis } from './kokoro-speech-synthesis.js'
import { MODEL_ID } from '../services/audiobook-installer.js'

describe('kokoro-speech-synthesis', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-kokoro-adapter-test-'))
    mocks.fromPretrained.mockClear()
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

    it('contains exactly the 28 English voices, all male before any female', () => {
      const adapter = createKokoroSpeechSynthesis()
      const voices = adapter.listVoices()
      expect(voices).toHaveLength(28)
      const firstFemaleIdx = voices.findIndex((v) => v.gender === 'Female')
      const lastMaleIdx = voices.map((v) => v.gender).lastIndexOf('Male')
      expect(firstFemaleIdx).toBeGreaterThan(lastMaleIdx)
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
      expect(mocks.fromPretrained).not.toHaveBeenCalled()
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
      // what's actually on the machine running the suite.
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
      expect(mocks.fromPretrained).toHaveBeenCalledTimes(1)

      // b has never warmed a model before, so it must load its own — this
      // is only true because worker-pool/TTS state moved from
      // kokoro-service.ts's old module scope into each factory call's own
      // closure, rather than staying a shared singleton.
      await b.startWorkerPool(1)
      expect(mocks.fromPretrained).toHaveBeenCalledTimes(2)
    })

    it('does not eagerly load the model just from being constructed', () => {
      createKokoroSpeechSynthesis()
      expect(mocks.fromPretrained).not.toHaveBeenCalled()
    })
  })
})
