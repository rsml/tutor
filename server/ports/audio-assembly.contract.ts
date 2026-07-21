import { describe, it, expect, beforeEach } from 'vitest'
import type { AudiobookChapterEntry } from '@shared/domain.js'
import type { AudioAssembly } from './audio-assembly.js'

/**
 * The behavioural contract every AudioAssembly implementation must
 * satisfy.
 *
 * This contract is fake only. The real adapter shells out to a downloaded
 * ffmpeg binary, see audiobook-installer.ts's getFfmpegPath, which is not
 * present in a test environment. No test in this repository may run this
 * contract against a real ffmpeg backed adapter.
 */
export function describeAudioAssemblyContract(
  label: string,
  makeSubject: () => AudioAssembly | Promise<AudioAssembly>,
): void {
  describe(`AudioAssembly contract (${label})`, () => {
    let subject: AudioAssembly

    const chapters: AudiobookChapterEntry[] = [
      { num: 1, title: 'Chapter One', mp3Path: '/fake/audio/01.mp3', durationSec: 10, startSec: 0 },
      { num: 2, title: 'Chapter Two', mp3Path: '/fake/audio/02.mp3', durationSec: 12, startSec: 10 },
    ]

    beforeEach(async () => {
      subject = await makeSubject()
    })

    describe('probeDurationSec', () => {
      it('returns a positive duration', async () => {
        const controller = new AbortController()
        const sec = await subject.probeDurationSec('/fake/audio/01.wav', controller.signal)
        expect(sec).toBeGreaterThan(0)
      })

      it('rejects a signal that is already aborted', async () => {
        const controller = new AbortController()
        controller.abort()
        await expect(
          subject.probeDurationSec('/fake/audio/01.wav', controller.signal),
        ).rejects.toThrow()
      })
    })

    describe('concatToM4b', () => {
      it('produces output for valid inputs', async () => {
        const controller = new AbortController()
        await expect(
          subject.concatToM4b({
            inputs: ['/fake/audio/01.wav', '/fake/audio/02.wav'],
            chapters,
            out: '/fake/audio/book.m4b',
            bitrate: '64k',
            signal: controller.signal,
          }),
        ).resolves.toBeUndefined()
      })

      it('leaves the output probeable afterward, with a positive duration', async () => {
        const controller = new AbortController()
        const out = '/fake/audio/book-probe.m4b'
        await subject.concatToM4b({
          inputs: ['/fake/audio/01.wav', '/fake/audio/02.wav'],
          chapters,
          out,
          bitrate: '64k',
          signal: controller.signal,
        })
        const sec = await subject.probeDurationSec(out, controller.signal)
        expect(sec).toBeGreaterThan(0)
      })

      it('rejects a signal that is already aborted, instead of completing', async () => {
        const controller = new AbortController()
        controller.abort()
        await expect(
          subject.concatToM4b({
            inputs: ['/fake/audio/01.wav'],
            chapters,
            out: '/fake/audio/aborted.m4b',
            bitrate: '64k',
            signal: controller.signal,
          }),
        ).rejects.toThrow()
      })

      it('still produces an M4B when a cover is requested, whether or not it embeds', async () => {
        const controller = new AbortController()
        const out = '/fake/audio/book-with-cover.m4b'
        await subject.concatToM4b({
          inputs: ['/fake/audio/01.wav', '/fake/audio/02.wav'],
          chapters,
          out,
          bitrate: '64k',
          coverPath: '/fake/covers/book.png',
          signal: controller.signal,
        })
        const sec = await subject.probeDurationSec(out, controller.signal)
        expect(sec).toBeGreaterThan(0)
      })
    })
  })
}
