import { describe, it, expect, beforeEach } from 'vitest'
import type { SpeechSynthesis } from './speech-synthesis.js'

/**
 * The behavioural contract every SpeechSynthesis implementation must
 * satisfy.
 *
 * This contract is fake only. kokoro-js loads a real ONNX model on first
 * use, so no test in this repository may run it against a real kokoro
 * adapter. Once server/adapters/kokoro-speech-synthesis.ts exists, it stays
 * covered by its own unit tests with kokoro-js mocked at the module
 * boundary, the same way server/services/kokoro-service.test.ts already
 * does, never by this contract.
 */
export function describeSpeechSynthesisContract(
  label: string,
  makeSubject: () => SpeechSynthesis | Promise<SpeechSynthesis>,
): void {
  describe(`SpeechSynthesis contract (${label})`, () => {
    let subject: SpeechSynthesis

    beforeEach(async () => {
      subject = await makeSubject()
    })

    describe('listVoices', () => {
      it('returns a non-empty catalogue', () => {
        expect(subject.listVoices().length).toBeGreaterThan(0)
      })

      it('gives every voice the documented fields', () => {
        for (const voice of subject.listVoices()) {
          expect(typeof voice.id).toBe('string')
          expect(voice.id.length).toBeGreaterThan(0)
          expect(typeof voice.name).toBe('string')
          expect(['American English', 'British English']).toContain(voice.language)
          expect(['Male', 'Female']).toContain(voice.gender)
          expect(typeof voice.grade).toBe('string')
        }
      })
    })

    describe('isInstalled and missingComponents', () => {
      it('agree with each other before anything is installed', () => {
        const installed = subject.isInstalled()
        const missing = subject.missingComponents()
        expect(installed).toBe(!missing.model && !missing.ffmpeg)
      })

      it('still agree with each other, and both report installed, once install resolves', async () => {
        await subject.install()
        const installed = subject.isInstalled()
        const missing = subject.missingComponents()
        expect(installed).toBe(!missing.model && !missing.ffmpeg)
        expect(installed).toBe(true)
      })
    })

    describe('synthesizePreview', () => {
      it('returns bytes for a known voice', async () => {
        const [voice] = subject.listVoices()
        const bytes = await subject.synthesizePreview(voice.id)
        expect(bytes).toBeInstanceOf(Buffer)
        expect(bytes.length).toBeGreaterThan(0)
      })

      it('returns the same bytes on a second call for the same voice', async () => {
        const [voice] = subject.listVoices()
        const first = await subject.synthesizePreview(voice.id)
        const second = await subject.synthesizePreview(voice.id)
        expect(second.equals(first)).toBe(true)
      })

      it('fails the way the real code fails for an unknown voice', async () => {
        await expect(subject.synthesizePreview('not-a-real-voice-id')).rejects.toThrow(/Unknown voice/)
      })
    })

    describe('synthesizeChapter', () => {
      it('reports sentences through onSentence', async () => {
        const [voice] = subject.listVoices()
        const seen: Array<{ idx: number; text: string }> = []
        await subject.synthesizeChapter({
          text: 'First sentence. Second sentence. Third sentence.',
          voiceId: voice.id,
          speed: 1.0,
          outPath: '/fake/out/chapter.wav',
          onSentence: (idx, text) => seen.push({ idx, text }),
        })
        expect(seen.length).toBeGreaterThan(0)
        expect(seen[0].idx).toBe(0)
      })

      it('fails the way the real code fails for an unknown voice', async () => {
        await expect(
          subject.synthesizeChapter({
            text: 'Hello there.',
            voiceId: 'not-a-real-voice-id',
            speed: 1.0,
            outPath: '/fake/out/chapter.wav',
          }),
        ).rejects.toThrow(/Unknown voice/)
      })

      it('fails the way the real code fails for an out of range speed', async () => {
        const [voice] = subject.listVoices()
        await expect(
          subject.synthesizeChapter({
            text: 'Hello there.',
            voiceId: voice.id,
            speed: 3.0,
            outPath: '/fake/out/chapter.wav',
          }),
        ).rejects.toThrow(/Invalid speed/)
      })

      it('rejects a signal that is already aborted', async () => {
        const [voice] = subject.listVoices()
        const controller = new AbortController()
        controller.abort()
        await expect(
          subject.synthesizeChapter({
            text: 'Hello there.',
            voiceId: voice.id,
            speed: 1.0,
            outPath: '/fake/out/chapter.wav',
            signal: controller.signal,
          }),
        ).rejects.toThrow(/abort/i)
      })
    })

    describe('worker pool', () => {
      it('starts and stops without error', async () => {
        await expect(subject.startWorkerPool(2)).resolves.toBeUndefined()
        await expect(subject.stopWorkerPool()).resolves.toBeUndefined()
      })

      it('stops without error even when no pool was started', async () => {
        await expect(subject.stopWorkerPool()).resolves.toBeUndefined()
      })
    })
  })
}
