import type { AudioAssembly, ConcatToM4bRequest } from './audio-assembly.js'

/**
 * Deterministic in-memory AudioAssembly. Never shells out to ffmpeg and
 * never touches the real filesystem, every path is just a map key here.
 *
 * A duration is derived deterministically from a path string the first
 * time that path is probed, and remembered from then on, so any test can
 * probe an arbitrary path without seeding one first. concatToM4b sums its
 * inputs' derived durations and records that total under the request's out
 * path, so a later probeDurationSec call against that same out path is
 * consistent with what was assembled, which is the closest an in-memory
 * fake can get to the real property that concatenating several clips
 * yields a file whose duration is roughly their sum.
 */

const ABORTED_MESSAGE = 'Audiobook generation aborted'

function derivedDurationSec(path: string): number {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) % 9973
  }
  return 1 + (hash % 300)
}

export interface FakeAudioAssembly extends AudioAssembly {
  /** Every concatToM4b request this fake has completed, most recent last, for tests that assert on adapter usage instead of just on results. */
  readonly calls: ConcatToM4bRequest[]
}

export function createFakeAudioAssembly(): FakeAudioAssembly {
  const durations = new Map<string, number>()
  const calls: ConcatToM4bRequest[] = []

  function durationFor(path: string): number {
    let sec = durations.get(path)
    if (sec === undefined) {
      sec = derivedDurationSec(path)
      durations.set(path, sec)
    }
    return sec
  }

  return {
    calls,

    async probeDurationSec(path: string, signal: AbortSignal) {
      if (signal.aborted) throw new Error(ABORTED_MESSAGE)
      return durationFor(path)
    },

    async concatToM4b(req: ConcatToM4bRequest) {
      if (req.signal.aborted) throw new Error(ABORTED_MESSAGE)
      let total = 0
      for (const input of req.inputs) {
        if (req.signal.aborted) throw new Error(ABORTED_MESSAGE)
        total += durationFor(input)
      }
      durations.set(req.out, total)
      calls.push(req)
    },
  }
}
