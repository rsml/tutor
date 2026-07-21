import type {
  SpeechSynthesis,
  MissingComponents,
  ProgressCallback,
  SynthesizeChapterRequest,
} from './speech-synthesis.js'

/**
 * Deterministic in-memory SpeechSynthesis. Never loads kokoro-js and never
 * touches the real filesystem, every path in a request is treated as an
 * opaque label rather than something read or written.
 *
 * The voice catalogue is a small synthetic set rather than a copy of the
 * real 28 voice Kokoro list, so this file never drifts out of sync with
 * kokoro-speech-synthesis.ts and so a reader can tell at a glance that the
 * ids are fake rather than real Kokoro voice ids.
 */

const FAKE_VOICES = [
  { id: 'fake-voice-male', name: 'Fake Male Voice', language: 'American English' as const, gender: 'Male' as const, grade: 'A' },
  { id: 'fake-voice-female', name: 'Fake Female Voice', language: 'British English' as const, gender: 'Female' as const, grade: 'B' },
]

const FAKE_MODEL_BYTES = 1_000
const FAKE_FFMPEG_BYTES = 500

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0)
}

export interface FakeSpeechSynthesisCalls {
  install: number
  readonly synthesizePreview: string[]
  readonly synthesizeChapter: SynthesizeChapterRequest[]
  readonly startWorkerPool: number[]
  stopWorkerPool: number
}

export interface FakeSpeechSynthesis extends SpeechSynthesis {
  /** A record of every call this fake has received, for tests that assert on adapter usage instead of just on results. */
  readonly calls: FakeSpeechSynthesisCalls
}

export function createFakeSpeechSynthesis(): FakeSpeechSynthesis {
  let modelInstalled = false
  let ffmpegInstalled = false
  const previewCache = new Map<string, Buffer>()

  const calls: FakeSpeechSynthesisCalls = {
    install: 0,
    synthesizePreview: [],
    synthesizeChapter: [],
    startWorkerPool: [],
    stopWorkerPool: 0,
  }

  function isKnownVoice(voiceId: string): boolean {
    return FAKE_VOICES.some((voice) => voice.id === voiceId)
  }

  function missingComponents(): MissingComponents {
    const missingModel = !modelInstalled
    const missingFfmpeg = !ffmpegInstalled
    return {
      model: missingModel,
      ffmpeg: missingFfmpeg,
      totalBytes: (missingModel ? FAKE_MODEL_BYTES : 0) + (missingFfmpeg ? FAKE_FFMPEG_BYTES : 0),
    }
  }

  return {
    calls,

    listVoices() {
      return FAKE_VOICES.map((voice) => ({ ...voice }))
    },

    isInstalled() {
      return modelInstalled && ffmpegInstalled
    },

    missingComponents,

    async install(onProgress?: ProgressCallback, signal?: AbortSignal) {
      calls.install++
      if (signal?.aborted) throw new Error('Install aborted')
      const missing = missingComponents()
      if (missing.model) {
        onProgress?.({ component: 'model', bytesDownloaded: 0, bytesTotal: FAKE_MODEL_BYTES, label: 'Downloading fake model' })
        modelInstalled = true
        onProgress?.({ component: 'model', bytesDownloaded: FAKE_MODEL_BYTES, bytesTotal: FAKE_MODEL_BYTES, label: 'Fake model installed' })
      }
      if (missing.ffmpeg) {
        onProgress?.({ component: 'ffmpeg', bytesDownloaded: 0, bytesTotal: FAKE_FFMPEG_BYTES, label: 'Downloading fake ffmpeg' })
        ffmpegInstalled = true
        onProgress?.({ component: 'ffmpeg', bytesDownloaded: FAKE_FFMPEG_BYTES, bytesTotal: FAKE_FFMPEG_BYTES, label: 'Fake ffmpeg installed' })
      }
    },

    async synthesizePreview(voiceId: string) {
      calls.synthesizePreview.push(voiceId)
      if (!isKnownVoice(voiceId)) {
        throw new Error(`Unknown voice: ${voiceId}`)
      }
      const cached = previewCache.get(voiceId)
      if (cached) return cached
      const bytes = Buffer.from(`fake-preview:${voiceId}`)
      previewCache.set(voiceId, bytes)
      return bytes
    },

    async synthesizeChapter(req: SynthesizeChapterRequest) {
      if (req.signal?.aborted) throw new Error('Synthesis aborted')
      if (!isKnownVoice(req.voiceId)) {
        throw new Error(`Unknown voice: ${req.voiceId}`)
      }
      if (req.speed < 0.5 || req.speed > 2.0) {
        throw new Error(`Invalid speed: ${req.speed} (must be 0.5-2.0)`)
      }
      const sentences = splitSentences(req.text)
      sentences.forEach((sentence, idx) => req.onSentence?.(idx, sentence))
      if (req.signal?.aborted) throw new Error('Synthesis aborted')
      calls.synthesizeChapter.push(req)
    },

    async startWorkerPool(workerCount: number) {
      calls.startWorkerPool.push(workerCount)
    },

    async stopWorkerPool() {
      calls.stopWorkerPool++
    },
  }
}
