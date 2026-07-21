import { describe, expect, it } from 'vitest'
import { createFakeClock } from './clock.fake.js'
import { describeClockContract } from './clock.contract.js'

describeClockContract('fake', () => createFakeClock())

describe('createFakeClock (whitebox)', () => {
  it('is deterministic: starts at a fixed instant and does not move on its own', () => {
    const clock = createFakeClock('2025-06-15T12:00:00.000Z')
    expect(clock.nowIso()).toBe('2025-06-15T12:00:00.000Z')
    expect(clock.nowIso()).toBe('2025-06-15T12:00:00.000Z')
  })

  it('advance moves the clock forward by the given milliseconds', () => {
    const clock = createFakeClock('2025-06-15T12:00:00.000Z')
    clock.advance(90_000)
    expect(clock.nowIso()).toBe('2025-06-15T12:01:30.000Z')
  })

  it('set jumps the clock to an exact instant', () => {
    const clock = createFakeClock('2025-06-15T12:00:00.000Z')
    clock.set('2030-01-01T00:00:00.000Z')
    expect(clock.nowIso()).toBe('2030-01-01T00:00:00.000Z')
  })

  it('newId is sequential and readable, not random', () => {
    const clock = createFakeClock()
    expect(clock.newId()).toBe('fake-id-1')
    expect(clock.newId()).toBe('fake-id-2')
  })
})
