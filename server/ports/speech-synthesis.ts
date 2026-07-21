import type { VoiceInfo } from '@shared/responses.js'

/**
 * Text to speech narration for audiobook generation, backed today by the
 * kokoro-js ONNX model in server/adapters/kokoro-speech-synthesis.ts and
 * its bundled installer in server/services/audiobook-installer.ts. This
 * port exists so that code depending on narration never imports kokoro-js
 * or its model loading directly. kokoro-js downloads and runs a real ONNX
 * model, so it cannot run inside a test process.
 *
 * The install surface, isInstalled, missingComponents, and install, covers
 * both the Kokoro model and the ffmpeg binary, not narration alone. That
 * matches the real code exactly. audiobook-installer.ts bundles the two
 * downloads into one installer because the product only ever offers
 * installing narration as a single step, and the real adapter's
 * isInstalled method defaults directly to that installer's isInstalled
 * function. The AudioAssembly port only covers ffmpeg's runtime
 * behaviour, probing and concatenating audio that is assumed to already be
 * installed, so it has no install surface of its own.
 *
 * getRecommendedWorkerCount, one of the pre-port kokoro-service.ts's
 * exports, deliberately has no home on this interface, and it is not even
 * part of the real adapter today. server/services/generate-audiobook.ts
 * keeps its own private copy of that arithmetic, a pure function of the
 * host machine's RAM and CPU count read from os.totalmem and os.cpus, not
 * of the synthesis engine itself, because it is a sizing policy the caller
 * computes and hands to startWorkerPool, not a capability the synthesis
 * engine provides.
 *
 * __testing, exported by both server/adapters/kokoro-speech-synthesis.ts
 * and audiobook-installer.ts, resets module level singleton state that
 * only the real adapter has, a lazily loaded KokoroTTS instance and a soft
 * concurrency queue. audiobook-installer.ts says outright in its own
 * comment that this seam is not part of the public API contract. A fake
 * has no such singleton to reset, and a contract every implementation must
 * satisfy cannot include a method that only one implementation needs, so
 * __testing stays an adapter only test seam and is not part of this port.
 *
 * The in-memory fake is speech-synthesis.fake.ts's createFakeSpeechSynthesis,
 * and the shared behavioural spec both must satisfy is
 * speech-synthesis.contract.ts's describeSpeechSynthesisContract, fake
 * only, for the same reason __testing above is adapter only.
 */

/** What the installer still needs to download, and roughly how many bytes. Mirrors MissingComponents in audiobook-installer.ts. */
export interface MissingComponents {
  model: boolean
  ffmpeg: boolean
  totalBytes: number
}

/** One progress tick reported during install. Mirrors InstallProgress in audiobook-installer.ts. */
export interface InstallProgress {
  component: 'model' | 'ffmpeg' | 'overall'
  bytesDownloaded: number
  bytesTotal: number
  label: string
}

/** Receives each InstallProgress tick as install downloads whatever is missing. */
export type ProgressCallback = (progress: InstallProgress) => void

/** Receives one call per sentence as synthesizeChapter streams audio, so a caller can show incremental progress. */
export type SentenceCallback = (sentenceIdx: number, sentenceText: string) => void

/**
 * outPath is always a WAV file in current usage, see
 * ConcatToM4bRequest.inputs in audio-assembly.ts, which AudioAssembly
 * later reads and concatenates. Nothing here enforces the extension, the
 * caller decides where the file goes.
 */
export interface SynthesizeChapterRequest {
  text: string
  voiceId: string
  speed: number
  outPath: string
  signal?: AbortSignal
  onSentence?: SentenceCallback
}

/**
 * startWorkerPool and stopWorkerPool bracket a batch of synthesizeChapter
 * calls. server/services/generate-audiobook.ts starts the pool once before
 * narrating every chapter in a book and stops it once after, rather than
 * once per chapter.
 */
export interface SpeechSynthesis {
  /** The narration voice catalogue, in a deliberate order that drives the voice picker UI. */
  listVoices(): VoiceInfo[]

  /** Reports whether both the Kokoro model and ffmpeg are already present. */
  isInstalled(): boolean

  /** Reports what is still missing and roughly how large the remaining download is. Agrees with isInstalled, both components report present exactly when isInstalled returns true. */
  missingComponents(): MissingComponents

  /** Downloads whatever missingComponents reports as missing, and resolves immediately if isInstalled is already true. */
  install(onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void>

  /** Synthesizes a short sample clip in the given voice, for the voice picker. Rejects for a voice id that listVoices does not report. */
  synthesizePreview(voiceId: string): Promise<Buffer>

  /** Narrates text to a WAV file at outPath. Rejects for an unknown voice, an out of range speed, or a signal that is already aborted. */
  synthesizeChapter(req: SynthesizeChapterRequest): Promise<void>

  /** Prepares the engine to run up to workerCount syntheses at once. */
  startWorkerPool(workerCount: number): Promise<void>

  /** Releases the worker pool. Safe to call even when no pool was started. */
  stopWorkerPool(): Promise<void>
}
