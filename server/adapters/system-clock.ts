import { randomUUID } from 'node:crypto'
import type { Clock } from '../ports/clock.js'

/**
 * The real Clock. Trivial by design: the current instant comes straight
 * from `Date`, and a fresh id from node:crypto's `randomUUID`, the same
 * function the ~15 call sites this port replaces already called directly.
 */
export function createSystemClock(): Clock {
  return {
    nowIso: () => new Date().toISOString(),
    newId: () => randomUUID(),
  }
}
