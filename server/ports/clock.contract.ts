import { describe, expect, it } from 'vitest'
import type { Clock } from './clock.js'

/**
 * Behavior every Clock implementation must satisfy. Written against the
 * Clock surface only, so this suite can run against the fake now and a
 * real system-clock adapter later.
 */
export function describeClockContract(label: string, makeSubject: () => Clock | Promise<Clock>) {
  describe(`Clock contract (${label})`, () => {
    it('nowIso returns a valid ISO 8601 string', async () => {
      const subject = await makeSubject()
      const iso = subject.nowIso()

      expect(typeof iso).toBe('string')
      // Round-tripping through Date must reproduce the exact string. That
      // is true for any timestamp shaped like Date.prototype.toISOString,
      // and false for anything that only looks like a timestamp.
      expect(new Date(iso).toISOString()).toBe(iso)
    })

    it('newId returns a non-empty string', async () => {
      const subject = await makeSubject()
      const id = subject.newId()

      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('newId returns distinct values across calls', async () => {
      const subject = await makeSubject()
      const ids = Array.from({ length: 20 }, () => subject.newId())

      expect(new Set(ids).size).toBe(ids.length)
    })
  })
}
