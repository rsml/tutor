import { join } from 'node:path'
import { existsSync, statSync, readdirSync } from 'node:fs'
import { mkdir, rename, unlink, chmod } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { request } from 'node:https'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { env } from '@huggingface/transformers'
import { KokoroTTS } from 'kokoro-js'
import { getDataDir } from '@shared/node/data-dir.js'

const execFileAsync = promisify(execFile)

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

// Approximate sizes for the UI (bytes)
export const KOKORO_MODEL_SIZE_BYTES = 115 * 1024 * 1024
export const FFMPEG_SIZE_BYTES = 80 * 1024 * 1024

// Configure transformers.js cache directory before any KokoroTTS call.
// kokoro-js uses @huggingface/transformers internally, and env is shared.
let envConfigured = false
function ensureEnvConfigured(): void {
  if (envConfigured) return
  env.cacheDir = join(getDataDir(), 'models', 'kokoro')
  env.allowRemoteModels = true
  envConfigured = true
}

export function getModelsDir(): string {
  ensureEnvConfigured()
  return join(getDataDir(), 'models', 'kokoro')
}

export function getFfmpegPath(): string {
  if (process.platform !== 'darwin') {
    throw new Error(
      `Automatic ffmpeg install not yet supported on ${process.platform}. Please install ffmpeg manually and place at ${join(getDataDir(), 'bin', 'ffmpeg')}`,
    )
  }
  return join(getDataDir(), 'bin', 'ffmpeg')
}

export interface MissingComponents {
  model: boolean
  ffmpeg: boolean
  totalBytes: number
}

// Recursively check for any .onnx file under the model dir — transformers.js
// preserves the HF repo tree, so the exact file path can vary by quantization.
function modelHasOnnxFile(dir: string): boolean {
  if (!existsSync(dir)) return false
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (modelHasOnnxFile(fullPath)) return true
      } else if (entry.isFile() && entry.name.endsWith('.onnx')) {
        const size = statSync(fullPath).size
        // Guard against tmp/partial files: real Kokoro onnx files are MBs.
        if (size > 1024 * 1024) return true
      }
    }
  } catch {
    return false
  }
  return false
}

function isModelPresent(): boolean {
  const modelDir = join(getModelsDir(), MODEL_ID)
  return modelHasOnnxFile(modelDir)
}

function isFfmpegPresent(): boolean {
  if (process.platform !== 'darwin') return false
  return existsSync(join(getDataDir(), 'bin', 'ffmpeg'))
}

export function getMissingComponents(): MissingComponents {
  const modelMissing = !isModelPresent()
  const ffmpegMissing = !isFfmpegPresent()
  let totalBytes = 0
  if (modelMissing) totalBytes += KOKORO_MODEL_SIZE_BYTES
  if (ffmpegMissing) totalBytes += FFMPEG_SIZE_BYTES
  return { model: modelMissing, ffmpeg: ffmpegMissing, totalBytes }
}

export function isInstalled(): boolean {
  return isModelPresent() && isFfmpegPresent()
}

export interface InstallProgress {
  component: 'model' | 'ffmpeg' | 'overall'
  bytesDownloaded: number
  bytesTotal: number
  label: string
}

export type ProgressCallback = (progress: InstallProgress) => void

export async function installAll(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  ensureEnvConfigured()
  const missing = getMissingComponents()

  const tasks: Promise<void>[] = []
  if (missing.model) tasks.push(installModel(onProgress, signal))
  if (missing.ffmpeg) tasks.push(installFfmpeg(onProgress, signal))

  await Promise.all(tasks)
}

async function installModel(
  onProgress: ProgressCallback | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  ensureEnvConfigured()
  await mkdir(getModelsDir(), { recursive: true })

  // Track per-file progress and aggregate. Kokoro downloads several files.
  const fileSizes = new Map<string, { loaded: number; total: number }>()

  await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: 'q8',
    progress_callback: (info) => {
      if (signal?.aborted) return
      if (info.status === 'progress') {
        fileSizes.set(info.file, { loaded: info.loaded, total: info.total })
      } else if (info.status === 'done') {
        const prev = fileSizes.get(info.file)
        if (prev) fileSizes.set(info.file, { loaded: prev.total, total: prev.total })
      }
      let loaded = 0
      let total = 0
      for (const entry of fileSizes.values()) {
        loaded += entry.loaded
        total += entry.total
      }
      // If total isn't known yet, fall back to the rough constant.
      const effectiveTotal = total > 0 ? total : KOKORO_MODEL_SIZE_BYTES
      onProgress?.({
        component: 'model',
        bytesDownloaded: loaded,
        bytesTotal: effectiveTotal,
        label: `Downloading Kokoro voices (${formatMb(loaded)}/${formatMb(effectiveTotal)} MB)...`,
      })
    },
  })
}

function formatMb(bytes: number): string {
  return Math.round(bytes / (1024 * 1024)).toString()
}

async function installFfmpeg(
  onProgress: ProgressCallback | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error(
      `Automatic ffmpeg install not yet supported on ${process.platform}. Please install ffmpeg manually and place at ${join(getDataDir(), 'bin', 'ffmpeg')}`,
    )
  }

  const binDir = join(getDataDir(), 'bin')
  await mkdir(binDir, { recursive: true })

  const finalPath = join(binDir, 'ffmpeg')
  const tmpZipPath = join(binDir, 'ffmpeg.zip.tmp')
  const extractDir = join(binDir, '.ffmpeg-extract.tmp')

  const cleanup = async (): Promise<void> => {
    for (const p of [tmpZipPath, extractDir]) {
      try {
        await execFileAsync('rm', ['-rf', p])
      } catch {
        // ignore
      }
    }
  }

  try {
    await downloadWithFollow('https://evermeet.cx/ffmpeg/getrelease/zip', tmpZipPath, signal, (loaded, total) => {
      const effectiveTotal = total > 0 ? total : FFMPEG_SIZE_BYTES
      onProgress?.({
        component: 'ffmpeg',
        bytesDownloaded: loaded,
        bytesTotal: effectiveTotal,
        label: `Downloading ffmpeg (${formatMb(loaded)}/${formatMb(effectiveTotal)} MB)...`,
      })
    })

    if (signal?.aborted) throw new Error('Install aborted')

    await mkdir(extractDir, { recursive: true })
    await execFileAsync('unzip', ['-o', tmpZipPath, '-d', extractDir])

    const extractedBinary = join(extractDir, 'ffmpeg')
    if (!existsSync(extractedBinary)) {
      throw new Error('ffmpeg binary not found in downloaded archive')
    }

    await chmod(extractedBinary, 0o755)
    await rename(extractedBinary, finalPath)
  } finally {
    await cleanup()
  }
}

// HTTPS download with redirect support, abort signal, atomic .tmp -> rename,
// and progress callbacks fed from Content-Length when present.
async function downloadWithFollow(
  url: string,
  destPath: string,
  signal: AbortSignal | undefined,
  onBytes: (loaded: number, total: number) => void,
  redirectsLeft = 5,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Install aborted'))
      return
    }

    const req = request(url, { method: 'GET' }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects'))
          return
        }
        const next = new URL(res.headers.location, url).toString()
        downloadWithFollow(next, destPath, signal, onBytes, redirectsLeft - 1)
          .then(resolve)
          .catch(reject)
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`HTTP ${status} downloading ${url}`))
        return
      }

      const total = Number(res.headers['content-length'] ?? 0)
      let loaded = 0

      // Write to a temp path; we then rename atomically. Caller treats the
      // .tmp path as "the destination during download".
      const tmp = destPath + '.partial'
      const fileStream = createWriteStream(tmp)

      const abortHandler = (): void => {
        req.destroy(new Error('Install aborted'))
        fileStream.destroy()
        unlink(tmp).catch(() => {})
      }
      signal?.addEventListener('abort', abortHandler, { once: true })

      res.on('data', (chunk: Buffer) => {
        loaded += chunk.length
        onBytes(loaded, total)
      })
      res.on('error', (err) => {
        signal?.removeEventListener('abort', abortHandler)
        fileStream.destroy()
        unlink(tmp).catch(() => {})
        reject(err)
      })
      fileStream.on('error', (err) => {
        signal?.removeEventListener('abort', abortHandler)
        unlink(tmp).catch(() => {})
        reject(err)
      })
      fileStream.on('finish', () => {
        signal?.removeEventListener('abort', abortHandler)
        rename(tmp, destPath).then(resolve).catch(reject)
      })

      res.pipe(fileStream)
    })

    req.on('error', reject)
    req.end()
  })
}

// Test seam: helpers exposed for unit tests to introspect internal state
// without mutating production behavior. Not part of the public API contract.
export const __testing = {
  ensureEnvConfigured,
  isModelPresent,
  isFfmpegPresent,
  modelHasOnnxFile,
  downloadWithFollow,
}
