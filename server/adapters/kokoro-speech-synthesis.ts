import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile, mkdir, rename } from 'node:fs/promises'
import { KokoroTTS, TextSplitterStream } from 'kokoro-js'
import { getDataDir } from '@shared/node/data-dir.js'
import type { VoiceInfo } from '@shared/responses.js'
import type {
  SpeechSynthesis,
  MissingComponents,
  ProgressCallback,
  SynthesizeChapterRequest,
} from '../ports/speech-synthesis.js'
import {
  isInstalled as installerIsInstalled,
  getMissingComponents as installerGetMissingComponents,
  installAll as installerInstallAll,
  getModelsDir,
  MODEL_ID,
} from '../services/audiobook-installer.js'

/**
 * kokoro-js backed SpeechSynthesis. Real logic lifted verbatim from
 * server/services/kokoro-service.ts: the voice catalogue tables, the
 * in-process synthesis pool, and tts.stream()-based synthesis. See that
 * file's git history for the pre-extraction shape.
 *
 * isInstalled, missingComponents, and install cover both the Kokoro model
 * and the ffmpeg binary, matching audiobook-installer.ts's own combined
 * install surface (see speech-synthesis.ts's JSDoc for why). They default
 * to that installer's real functions, but are injectable through deps so a
 * test can probe install-surface delegation without touching the real
 * filesystem or data dir.
 *
 * getRecommendedWorkerCount and __testing deliberately have no home on the
 * SpeechSynthesis interface (see speech-synthesis.ts's JSDoc). __testing
 * still needs a place to live because kokoro-service.ts's thin shim resets
 * this adapter's one production singleton between test cases, so it's
 * attached to the richer KokoroSpeechSynthesis type this factory actually
 * returns, alongside but outside the SpeechSynthesis contract itself.
 */

// Hardcoded voice catalogue mirrors @kokoro-js voices (see
// node_modules/kokoro-js/dist/kokoro.js, the $ frozen object). We hardcode
// to avoid loading the model just to enumerate. Order is intentional:
// male American first (am_michael per user preference), then male British,
// female American, female British. Within each group, alphabetical except
// am_michael is forced to the front.
const VOICE_GRADES: Record<string, string> = {
  am_michael: 'C+',
  am_adam: 'F+',
  am_echo: 'D',
  am_eric: 'D',
  am_fenrir: 'C+',
  am_liam: 'D',
  am_onyx: 'D',
  am_puck: 'C+',
  am_santa: 'D-',
  bm_george: 'C',
  bm_lewis: 'D+',
  bm_daniel: 'D',
  bm_fable: 'C',
  af_heart: 'A',
  af_alloy: 'C',
  af_aoede: 'C+',
  af_bella: 'A-',
  af_jessica: 'D',
  af_kore: 'C+',
  af_nicole: 'B-',
  af_nova: 'C',
  af_river: 'D',
  af_sarah: 'C+',
  af_sky: 'C-',
  bf_emma: 'B-',
  bf_isabella: 'C',
  bf_alice: 'D',
  bf_lily: 'D',
}

const VOICE_NAMES: Record<string, string> = {
  am_michael: 'Michael',
  am_adam: 'Adam',
  am_echo: 'Echo',
  am_eric: 'Eric',
  am_fenrir: 'Fenrir',
  am_liam: 'Liam',
  am_onyx: 'Onyx',
  am_puck: 'Puck',
  am_santa: 'Santa',
  bm_george: 'George',
  bm_lewis: 'Lewis',
  bm_daniel: 'Daniel',
  bm_fable: 'Fable',
  af_heart: 'Heart',
  af_alloy: 'Alloy',
  af_aoede: 'Aoede',
  af_bella: 'Bella',
  af_jessica: 'Jessica',
  af_kore: 'Kore',
  af_nicole: 'Nicole',
  af_nova: 'Nova',
  af_river: 'River',
  af_sarah: 'Sarah',
  af_sky: 'Sky',
  bf_emma: 'Emma',
  bf_isabella: 'Isabella',
  bf_alice: 'Alice',
  bf_lily: 'Lily',
}

// Order is significant — drives the picker UI.
const VOICE_ORDER: string[] = [
  // Male American (am_michael first by user preference)
  'am_michael',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_onyx',
  'am_puck',
  'am_santa',
  // Male British
  'bm_george',
  'bm_lewis',
  'bm_daniel',
  'bm_fable',
  // Female American
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  // Female British
  'bf_emma',
  'bf_isabella',
  'bf_alice',
  'bf_lily',
]

function voiceLanguage(id: string): 'American English' | 'British English' {
  return id.startsWith('a') ? 'American English' : 'British English'
}

function voiceGender(id: string): 'Male' | 'Female' {
  return id[1] === 'm' ? 'Male' : 'Female'
}

function listVoicesImpl(): VoiceInfo[] {
  return VOICE_ORDER.map((id) => ({
    id,
    name: VOICE_NAMES[id]!,
    language: voiceLanguage(id),
    gender: voiceGender(id),
    grade: VOICE_GRADES[id]!,
  }))
}

// Kokoro's tokenizer truncates to ~510 tokens silently. tts.generate() is
// limited to a single chunk and clips long chapters to ~150 words of audio.
// Use tts.stream() instead — it splits on sentence boundaries and yields
// one RawAudio per sentence. We collect, concatenate, and wrap into a
// single RawAudio for the WAV write.
interface RawAudioLike {
  audio: Float32Array
  sampling_rate: number
  save: (path: string) => Promise<void>
}

/** Adapter-only test seam, not part of the SpeechSynthesis port contract. Resets the one lazily-loaded TTS singleton and worker-pool queue this factory instance owns. */
export interface KokoroTestingHooks {
  reset(): void
  setTtsInstance(instance: KokoroTTS | null): void
}

export interface KokoroSpeechSynthesis extends SpeechSynthesis {
  __testing: KokoroTestingHooks
}

export interface KokoroSpeechSynthesisDeps {
  /** Reports whether the Kokoro model and ffmpeg are both already present. Defaults to audiobook-installer.ts's isInstalled. Injectable so a test can probe install state without touching the real filesystem or data dir. */
  isInstalled?: () => boolean
  /** Reports what remains to be installed and its size. Defaults to audiobook-installer.ts's getMissingComponents. */
  missingComponents?: () => MissingComponents
  /** Downloads whatever missingComponents reports as missing. Defaults to audiobook-installer.ts's installAll. */
  install?: (onProgress?: ProgressCallback, signal?: AbortSignal) => Promise<void>
}

export function createKokoroSpeechSynthesis(deps: KokoroSpeechSynthesisDeps = {}): KokoroSpeechSynthesis {
  const isInstalledProbe = deps.isInstalled ?? installerIsInstalled
  const missingComponentsProbe = deps.missingComponents ?? installerGetMissingComponents
  const installProbe = deps.install ?? installerInstallAll

  // --- In-process synthesis pool (concurrency-limited; see DONE_WITH_CONCERNS) ---
  //
  // v1 runs synthesis on the main event loop with a concurrency cap. The Kokoro
  // instance internally serializes inference per model anyway, so concurrent
  // generate() calls on the same instance yield no parallelism. The "pool"
  // is a soft promise queue; future work can replace with node:worker_threads
  // each owning their own KokoroTTS instance for true parallel inference.
  let concurrencyLimit = 1
  let inFlight = 0
  const queue: Array<() => void> = []

  async function acquireSlot(): Promise<void> {
    if (inFlight < concurrencyLimit) {
      inFlight++
      return
    }
    await new Promise<void>((resolve) => queue.push(resolve))
    inFlight++
  }

  function releaseSlot(): void {
    inFlight--
    const next = queue.shift()
    if (next) next()
  }

  let ttsInstance: KokoroTTS | null = null
  let ttsLoadingPromise: Promise<KokoroTTS> | null = null

  async function getTts(): Promise<KokoroTTS> {
    if (ttsInstance) return ttsInstance
    if (ttsLoadingPromise) return ttsLoadingPromise
    // Touch the models dir getter so transformers.js env is configured.
    getModelsDir()
    ttsLoadingPromise = KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8' }).then((tts) => {
      ttsInstance = tts
      ttsLoadingPromise = null
      return tts
    })
    return ttsLoadingPromise
  }

  async function synthesizeFullText(
    text: string,
    voiceId: string,
    speed: number,
    signal?: AbortSignal,
    onSentence?: (sentenceIdx: number, sentenceText: string) => void,
  ): Promise<RawAudioLike> {
    await acquireSlot()
    try {
      const tts = await getTts()
      const chunks: RawAudioLike[] = []
      let totalSamples = 0
      let samplingRate = 24000
      // kokoro-js types voice as keyof typeof VOICES but accepts any string at
      // runtime via _validate_voice; we already validated against VOICE_NAMES.
      // tts.stream(text) has a bug: it pushes text into an internal
      // TextSplitterStream but never calls close(), so the async iterator
      // waits forever once the splitter exhausts its initial buffer. Build
      // and close the splitter ourselves to terminate cleanly.
      const splitter = new TextSplitterStream()
      splitter.push(text)
      splitter.close()
      let i = 0
      for await (const chunk of tts.stream(splitter, { voice: voiceId as never, speed })) {
        if (signal?.aborted) throw new Error('Synthesis aborted')
        const audio = chunk.audio as unknown as RawAudioLike
        chunks.push(audio)
        totalSamples += audio.audio.length
        samplingRate = audio.sampling_rate
        onSentence?.(i, (chunk as unknown as { text: string }).text)
        i++
      }
      if (chunks.length === 0) {
        throw new Error('Kokoro produced no audio for input text')
      }
      const merged = new Float32Array(totalSamples)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk.audio, offset)
        offset += chunk.audio.length
      }
      // RawAudio isn't exported from kokoro-js; pull the constructor off the
      // first chunk and re-construct with the merged buffer so we can reuse
      // its .save() method (handles WAV header writing).
      const RawAudioCtor = (chunks[0] as unknown as { constructor: new (audio: Float32Array, sampling_rate: number) => RawAudioLike }).constructor
      return new RawAudioCtor(merged, samplingRate)
    } finally {
      releaseSlot()
    }
  }

  return {
    listVoices(): VoiceInfo[] {
      return listVoicesImpl()
    },

    isInstalled(): boolean {
      return isInstalledProbe()
    },

    missingComponents(): MissingComponents {
      return missingComponentsProbe()
    },

    async install(onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void> {
      return installProbe(onProgress, signal)
    },

    async synthesizePreview(voiceId: string): Promise<Buffer> {
      if (!VOICE_NAMES[voiceId]) {
        throw new Error(`Unknown voice: ${voiceId}`)
      }
      const cacheDir = join(getDataDir(), 'cache', 'voice-previews')
      const cachePath = join(cacheDir, `${voiceId}.wav`)

      if (existsSync(cachePath)) {
        return readFile(cachePath)
      }

      await mkdir(cacheDir, { recursive: true })
      const sampleText = `Hello! This is the ${VOICE_NAMES[voiceId]} voice for your audiobooks.`
      const result = await synthesizeFullText(sampleText, voiceId, 1.0)
      const tmp = cachePath + '.tmp'
      await result.save(tmp)
      await rename(tmp, cachePath)
      return readFile(cachePath)
    },

    async synthesizeChapter(req: SynthesizeChapterRequest): Promise<void> {
      const { text, voiceId, speed, outPath, signal, onSentence } = req
      if (signal?.aborted) throw new Error('Synthesis aborted')
      if (!VOICE_NAMES[voiceId]) {
        throw new Error(`Unknown voice: ${voiceId}`)
      }
      if (speed < 0.5 || speed > 2.0) {
        throw new Error(`Invalid speed: ${speed} (must be 0.5-2.0)`)
      }

      const result = await synthesizeFullText(text, voiceId, speed, signal, onSentence)

      if (signal?.aborted) throw new Error('Synthesis aborted')

      const tmp = outPath + '.tmp'
      await result.save(tmp)
      await rename(tmp, outPath)
    },

    async startWorkerPool(workerCount: number): Promise<void> {
      concurrencyLimit = Math.max(1, workerCount)
      // Eagerly warm the model so the first chapter doesn't pay full load cost.
      await getTts()
    },

    async stopWorkerPool(): Promise<void> {
      // Drain pending. We don't tear down the KokoroTTS instance — onnxruntime
      // doesn't have a public "unload" and reloading is expensive. Subsequent
      // startWorkerPool calls reuse it.
      concurrencyLimit = 1
    },

    __testing: {
      reset(): void {
        concurrencyLimit = 1
        inFlight = 0
        queue.length = 0
        ttsInstance = null
        ttsLoadingPromise = null
      },
      setTtsInstance(instance: KokoroTTS | null): void {
        ttsInstance = instance
      },
    },
  }
}
