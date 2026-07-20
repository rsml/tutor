import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock data-dir so the installer always points at a temp dir.
let testDir: string

vi.mock('@shared/node/data-dir.js', () => ({
  getDataDir: () => testDir,
}))

// Mock kokoro-js so tests never trigger a real model download. The installer
// only uses KokoroTTS.from_pretrained; we replace it with a no-op.
type FromPretrainedFn = (id: string, opts?: { dtype?: string; progress_callback?: (info: unknown) => void }) => Promise<unknown>
const fromPretrainedMock = vi.fn<FromPretrainedFn>(async () => ({}))
vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: (id: string, opts?: { dtype?: string; progress_callback?: (info: unknown) => void }) => fromPretrainedMock(id, opts),
  },
}))

// Mock @huggingface/transformers env so reading getModelsDir doesn't blow up.
vi.mock('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: true },
}))

import * as installer from './audiobook-installer.js'

describe('audiobook-installer', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'tutor-installer-test-'))
    fromPretrainedMock.mockClear()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('isInstalled', () => {
    it('returns false when no files present', () => {
      expect(installer.isInstalled()).toBe(false)
    })

    it('returns false when only ffmpeg is present (no model)', async () => {
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')
      expect(installer.isInstalled()).toBe(false)
    })

    it('returns false when only model is present (no ffmpeg)', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', installer.MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      // Fake .onnx > 1 MB so the size guard passes
      const buf = Buffer.alloc(2 * 1024 * 1024)
      await writeFile(join(modelDir, 'model_q8.onnx'), buf)
      expect(installer.isInstalled()).toBe(false)
    })

    it('returns true when both model and ffmpeg are present', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', installer.MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      const buf = Buffer.alloc(2 * 1024 * 1024)
      await writeFile(join(modelDir, 'model_q8.onnx'), buf)

      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')

      expect(installer.isInstalled()).toBe(true)
    })

    it('ignores tiny .onnx files (treats them as partial downloads)', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', installer.MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      // < 1 MB — should NOT count as installed
      await writeFile(join(modelDir, 'model_q8.onnx'), Buffer.alloc(1024))

      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')

      expect(installer.isInstalled()).toBe(false)
    })
  })

  describe('getMissingComponents', () => {
    it('reports both missing when nothing installed', () => {
      const missing = installer.getMissingComponents()
      expect(missing.model).toBe(true)
      expect(missing.ffmpeg).toBe(true)
      expect(missing.totalBytes).toBe(installer.KOKORO_MODEL_SIZE_BYTES + installer.FFMPEG_SIZE_BYTES)
    })

    it('reports only model missing when ffmpeg present', async () => {
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')
      const missing = installer.getMissingComponents()
      expect(missing.model).toBe(true)
      expect(missing.ffmpeg).toBe(false)
      expect(missing.totalBytes).toBe(installer.KOKORO_MODEL_SIZE_BYTES)
    })

    it('reports only ffmpeg missing when model present', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', installer.MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      await writeFile(join(modelDir, 'model_q8.onnx'), Buffer.alloc(2 * 1024 * 1024))
      const missing = installer.getMissingComponents()
      expect(missing.model).toBe(false)
      expect(missing.ffmpeg).toBe(true)
      expect(missing.totalBytes).toBe(installer.FFMPEG_SIZE_BYTES)
    })

    it('reports zero total when fully installed', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', installer.MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      await writeFile(join(modelDir, 'model_q8.onnx'), Buffer.alloc(2 * 1024 * 1024))
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')
      const missing = installer.getMissingComponents()
      expect(missing.totalBytes).toBe(0)
    })
  })

  describe('getModelsDir / getFfmpegPath', () => {
    it('getModelsDir returns the configured path', () => {
      expect(installer.getModelsDir()).toBe(join(testDir, 'models', 'kokoro'))
    })

    it('getFfmpegPath returns ffmpeg binary path on darwin', () => {
      if (process.platform === 'darwin') {
        expect(installer.getFfmpegPath()).toBe(join(testDir, 'bin', 'ffmpeg'))
      } else {
        expect(() => installer.getFfmpegPath()).toThrow(/not yet supported/)
      }
    })
  })

  describe('installAll', () => {
    it('calls kokoro-js model download when model missing', async () => {
      // ffmpeg pre-installed so we only test the model branch.
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')

      await installer.installAll()
      expect(fromPretrainedMock).toHaveBeenCalledOnce()
      const call = fromPretrainedMock.mock.calls[0]
      expect(call[0]).toBe(installer.MODEL_ID)
      expect(call[1]?.dtype).toBe('q8')
    })

    it('skips both downloads when everything is installed', async () => {
      const modelDir = join(testDir, 'models', 'kokoro', installer.MODEL_ID, 'onnx')
      await mkdir(modelDir, { recursive: true })
      await writeFile(join(modelDir, 'model_q8.onnx'), Buffer.alloc(2 * 1024 * 1024))
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')

      await installer.installAll()
      expect(fromPretrainedMock).not.toHaveBeenCalled()
    })

    it('forwards progress callbacks for the model download', async () => {
      // ffmpeg pre-installed so installAll only triggers the model branch.
      await mkdir(join(testDir, 'bin'), { recursive: true })
      await writeFile(join(testDir, 'bin', 'ffmpeg'), '', 'utf-8')

      fromPretrainedMock.mockImplementationOnce(async (_id, opts) => {
        opts?.progress_callback?.({ status: 'progress', file: 'model_q8.onnx', loaded: 1_000_000, total: 10_000_000, name: 'kokoro', progress: 10 })
        opts?.progress_callback?.({ status: 'done', file: 'model_q8.onnx', name: 'kokoro' })
        return {}
      })

      const progress: Array<{ component: string; bytesDownloaded: number; bytesTotal: number; label: string }> = []
      await installer.installAll((p) => progress.push(p))
      expect(progress.length).toBeGreaterThan(0)
      expect(progress[0].component).toBe('model')
      expect(progress[0].label).toContain('Downloading Kokoro voices')
    })
  })
})
