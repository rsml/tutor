import type { AudiobookManifest } from '@shared/domain'
import type { AudiobookStatus, VoiceInfo } from '@shared/responses'
import { apiFetch, expectOk, request } from './http'

/**
 * Endpoints for the narration engine, the voices it offers, and the
 * audiobook generated for each book.
 */

/** The audiobook state for one book, covering whether it exists, how far narration has gotten, and its manifest. */
export interface BookAudiobookStatus {
  exists: boolean
  path?: string
  generatedChapters: number[]
  manifest: AudiobookManifest | null
}

/**
 * Check whether a book has a generated audiobook and how far generation has progressed.
 *
 * Tracing is switched off because this call runs on a four second interval
 * while an audiobook is generating. Adding the trace header would turn a
 * CORS-simple GET into a preflighted one, doubling the request count for as
 * long as the poll runs.
 */
export async function getBookAudiobook(bookId: string): Promise<BookAudiobookStatus> {
  return request<BookAudiobookStatus>(`/api/books/${bookId}/audiobook`, { trace: false })
}

/** The voice, speed, and remember or replace choices generateAudiobook sends. */
export interface GenerateAudiobookBody {
  voiceId?: string
  speed?: number
  rememberAsDefault?: boolean
  confirmReplace?: boolean
}

/** What generateAudiobook resolves with once narration has been queued. */
export interface GenerateAudiobookResult {
  taskId: string
}

/** Start narrating a book's chapters into a single audiobook file. */
export async function generateAudiobook(
  bookId: string,
  body: GenerateAudiobookBody,
): Promise<GenerateAudiobookResult> {
  return request<GenerateAudiobookResult>(`/api/books/${bookId}/audiobook`, { method: 'POST', body })
}

/** Check whether the narration engine, meaning the model and ffmpeg, is installed. */
export async function getEngineStatus(): Promise<AudiobookStatus> {
  return request<AudiobookStatus>('/api/audiobook/status')
}

/**
 * Kick off the narration engine install.
 *
 * A 409 from the server means the engine is already installed or an install
 * is already running. Either outcome is exactly what this call wants, so it
 * resolves instead of throwing. request() would turn that response into an
 * ApiError, so this goes through apiFetch directly and checks the status by
 * hand.
 */
export async function installEngine(): Promise<void> {
  const response = await apiFetch('/api/audiobook/install', { method: 'POST' })
  if (response.status === 409) return
  await expectOk(response, 'Failed to start the narrator install')
}

/** List the narrator voices available for the voice picker. */
export async function listVoices(): Promise<VoiceInfo[]> {
  const { voices } = await request<{ voices: VoiceInfo[] }>('/api/audiobook/voices')
  return voices
}

/** What revealAudiobook resolves with, meaning the file path and whether the OS reveal succeeded. */
export interface RevealAudiobookResult {
  path: string
  revealed: boolean
}

/** Ask the server to reveal a book's audiobook file in Finder or Explorer. */
export async function revealAudiobook(bookId: string): Promise<RevealAudiobookResult> {
  return request<RevealAudiobookResult>(`/api/books/${bookId}/audiobook/reveal`, { method: 'POST' })
}
