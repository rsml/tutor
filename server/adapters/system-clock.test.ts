import { describe, expect, it } from 'vitest'
import { createSystemClock } from './system-clock.js'
import { describeClockContract } from '../ports/clock.contract.js'

describeClockContract('real system clock', () => createSystemClock())

describe('createSystemClock (whitebox)', () => {
  it('nowIso reports the actual current time, not a fixed instant', () => {
    const clock = createSystemClock()
    const before = Date.now()
    const reported = new Date(clock.nowIso()).getTime()
    const after = Date.now()

    expect(reported).toBeGreaterThanOrEqual(before)
    expect(reported).toBeLessThanOrEqual(after)
  })

  it('newId returns a v4 UUID', () => {
    const clock = createSystemClock()
    expect(clock.newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})
