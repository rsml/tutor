import type { Clock } from './clock.js'

const DEFAULT_START_ISO = '2024-01-01T00:00:00.000Z'

/** A Clock that also lets a test control what time it reports. */
export interface FakeClock extends Clock {
  /** Moves the fake clock forward by this many milliseconds. */
  advance(ms: number): void
  /** Jumps the fake clock to an exact instant. */
  set(iso: string): void
}

/**
 * Deterministic, controllable Clock. Starts at a fixed instant (2024-01-01
 * by default, or whatever startIso is given) and never moves on its own,
 * so nowIso() is stable across a whole test unless advance() or set() is
 * called. newId() returns short, sequential, readable ids rather than
 * random UUIDs, which is both deterministic and easy to assert on.
 */
export function createFakeClock(startIso: string = DEFAULT_START_ISO): FakeClock {
  let currentMs = new Date(startIso).getTime()
  let idCounter = 0

  return {
    nowIso: () => new Date(currentMs).toISOString(),
    newId: () => `fake-id-${++idCounter}`,
    advance(ms) {
      currentMs += ms
    },
    set(iso) {
      currentMs = new Date(iso).getTime()
    },
  }
}
