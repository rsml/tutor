import os from 'node:os'
import type { KokoroTTS } from 'kokoro-js'
import type { VoiceInfo } from '@shared/responses.js'
import { createKokoroSpeechSynthesis } from '../adapters/kokoro-speech-synthesis.js'

/**
 * THIS FILE IS A TEMPORARY SHIM.
 *
 * The real Kokoro speech synthesis logic used to live directly in this
 * module; it now lives in server/adapters/kokoro-speech-synthesis.ts as
 * createKokoroSpeechSynthesis, a factory implementing the SpeechSynthesis
 * port. This shim exists only because server/routes/books.ts and
 * server/routes/audiobook.ts import listVoices, synthesizePreview, and
 * friends at module scope today, so the singleton-to-factory conversion
 * had to land as one atomic step rather than half-converted — a
 * half-converted state would leave some call sites on the old module
 * singleton and others on the new adapter instance, silently disagreeing
 * about worker pool and model state.
 *
 * Callers move onto the SpeechSynthesis port directly in a later refactor
 * stage, at which point this file and its callers both go away. Until
 * then, every export below just forwards to the one shared adapter
 * instance created here.
 */

export type { VoiceInfo }

const adapter = createKokoroSpeechSynthesis()

export function listVoices(): VoiceInfo[] {
  return adapter.listVoices()
}

export function isModelInstalled(): boolean {
  return adapter.isInstalled()
}

// Worker-count heuristic: RAM budget = 25% of total RAM / 600MB per worker.
// Capped by CPU count, hard ceiling of 16, with an optional user override.
// Not part of the SpeechSynthesis port (see speech-synthesis.ts's JSDoc for
// why) — it's a pure sizing policy over the host machine rather than a
// synthesis capability, so it stays a free function here instead of moving
// into the adapter.
export function getRecommendedWorkerCount(override?: number): number {
  const ramBudget = Math.floor((os.totalmem() * 0.25) / (600 * 1024 * 1024))
  const cpuCount = os.cpus().length
  return Math.max(1, Math.min(override ?? Infinity, ramBudget, cpuCount, 16))
}

export async function synthesizePreview(voiceId: string): Promise<Buffer> {
  return adapter.synthesizePreview(voiceId)
}

export async function synthesizeChapter(
  text: string,
  voiceId: string,
  speed: number,
  outPath: string,
  signal?: AbortSignal,
  onSentence?: (sentenceIdx: number, sentenceText: string) => void,
): Promise<void> {
  return adapter.synthesizeChapter({ text, voiceId, speed, outPath, signal, onSentence })
}

export async function startWorkerPool(workerCount: number): Promise<void> {
  return adapter.startWorkerPool(workerCount)
}

export async function stopWorkerPool(): Promise<void> {
  return adapter.stopWorkerPool()
}

// Test seam — lets tests reset the lazily-loaded TTS singleton and worker
// queue state between cases without re-requiring the module. Forwards to
// the adapter's own __testing hooks (see kokoro-speech-synthesis.ts); not
// part of the SpeechSynthesis port contract.
export const __testing = {
  reset: (): void => adapter.__testing.reset(),
  setTtsInstance: (instance: KokoroTTS | null): void => adapter.__testing.setTtsInstance(instance),
}
