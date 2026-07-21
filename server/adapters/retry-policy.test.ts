import { describe, expect, it } from 'vitest'
import type { TextGenerationErrorKind } from '../ports/text-generation.js'
import { nextDelayMs, RETRY_MAX_DELAY_MS, RETRY_POLICY, RETRY_TOTAL_ELAPSED_CEILING_MS } from './retry-policy.js'

/**
 * Pure unit tests against the retry policy table and nextDelayMs, run with
 * an injected deterministic rng so every asserted number is exact. None of
 * these tests wait out a real delay or call Math.random, both of which
 * would make the suite slow or flaky.
 */

const RETRYABLE_KINDS: TextGenerationErrorKind[] = ['rate-limited', 'overloaded', 'network-failed', 'timed-out']
const NEVER_RETRIED_KINDS: TextGenerationErrorKind[] = ['auth-failed', 'content-refused', 'unknown']

describe('RETRY_POLICY', () => {
  it('pins the max attempts for every retryable kind', () => {
    expect(RETRY_POLICY['rate-limited'].maxAttempts).toBe(4)
    expect(RETRY_POLICY['overloaded'].maxAttempts).toBe(3)
    expect(RETRY_POLICY['network-failed'].maxAttempts).toBe(3)
    expect(RETRY_POLICY['timed-out'].maxAttempts).toBe(2)
  })

  it('pins the network-failed base delay at 200ms', () => {
    expect(RETRY_POLICY['network-failed'].baseDelayMs).toBe(200)
  })

  it('pins every never-retried kind to exactly one attempt', () => {
    for (const kind of NEVER_RETRIED_KINDS) {
      expect(RETRY_POLICY[kind].maxAttempts).toBe(1)
    }
  })

  it('pins the caps used throughout the policy', () => {
    expect(RETRY_MAX_DELAY_MS).toBe(20_000)
    expect(RETRY_TOTAL_ELAPSED_CEILING_MS).toBe(60_000)
  })
})

describe('nextDelayMs, kinds that never retry', () => {
  it.each(NEVER_RETRIED_KINDS)('%s always returns null, regardless of attempt', (kind) => {
    expect(nextDelayMs(kind, 1)).toBeNull()
    expect(nextDelayMs(kind, 2)).toBeNull()
    expect(nextDelayMs(kind, 99)).toBeNull()
  })
})

describe('nextDelayMs, the maxAttempts cutoff', () => {
  it('returns null once attempt reaches maxAttempts, for every retryable kind', () => {
    for (const kind of RETRYABLE_KINDS) {
      const { maxAttempts } = RETRY_POLICY[kind]
      expect(nextDelayMs(kind, maxAttempts, { rng: () => 1 })).toBeNull()
      expect(nextDelayMs(kind, maxAttempts + 5, { rng: () => 1 })).toBeNull()
    }
  })

  it('still returns a number one attempt below maxAttempts', () => {
    for (const kind of RETRYABLE_KINDS) {
      const { maxAttempts } = RETRY_POLICY[kind]
      expect(nextDelayMs(kind, maxAttempts - 1, { rng: () => 1 })).not.toBeNull()
    }
  })
})

describe('nextDelayMs, full jitter formula', () => {
  // rng() * min(baseDelayMs * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS). rng
  // is injected, so () => 1 exercises the worst case (no reduction from
  // jitter), () => 0 the best case (always zero), and () => 0.5 a value in
  // between, pinning the multiplication itself rather than just its range.

  it('overloaded, base 1000ms, attempts 1 and 2', () => {
    expect(nextDelayMs('overloaded', 1, { rng: () => 1 })).toBe(1000)
    expect(nextDelayMs('overloaded', 1, { rng: () => 0 })).toBe(0)
    expect(nextDelayMs('overloaded', 1, { rng: () => 0.5 })).toBe(500)

    expect(nextDelayMs('overloaded', 2, { rng: () => 1 })).toBe(2000)
    expect(nextDelayMs('overloaded', 2, { rng: () => 0 })).toBe(0)
    expect(nextDelayMs('overloaded', 2, { rng: () => 0.5 })).toBe(1000)
  })

  it('network-failed, base 200ms, attempts 1 and 2', () => {
    expect(nextDelayMs('network-failed', 1, { rng: () => 1 })).toBe(200)
    expect(nextDelayMs('network-failed', 1, { rng: () => 0.5 })).toBe(100)

    expect(nextDelayMs('network-failed', 2, { rng: () => 1 })).toBe(400)
    expect(nextDelayMs('network-failed', 2, { rng: () => 0.5 })).toBe(200)
  })

  it('timed-out, base 1000ms, its only retryable attempt', () => {
    expect(nextDelayMs('timed-out', 1, { rng: () => 1 })).toBe(1000)
    expect(nextDelayMs('timed-out', 1, { rng: () => 0.5 })).toBe(500)
  })

  it('rate-limited without a retryAfterMs falls back to exponential full jitter', () => {
    expect(nextDelayMs('rate-limited', 1, { rng: () => 1 })).toBe(1000)
    expect(nextDelayMs('rate-limited', 2, { rng: () => 1 })).toBe(2000)
    expect(nextDelayMs('rate-limited', 3, { rng: () => 1 })).toBe(4000)
  })
})

describe('nextDelayMs, rate-limited retryAfterMs', () => {
  it('returns retryAfterMs exactly when it is under the per-delay cap', () => {
    expect(nextDelayMs('rate-limited', 1, { retryAfterMs: 5000 })).toBe(5000)
  })

  it('clamps retryAfterMs to RETRY_MAX_DELAY_MS when the provider asks for longer', () => {
    expect(nextDelayMs('rate-limited', 1, { retryAfterMs: 999_999 })).toBe(RETRY_MAX_DELAY_MS)
  })

  it('ignores retryAfterMs once attempt has reached maxAttempts', () => {
    expect(nextDelayMs('rate-limited', RETRY_POLICY['rate-limited'].maxAttempts, { retryAfterMs: 1000 })).toBeNull()
  })

  it('is ignored for kinds other than rate-limited, which fall back to exponential full jitter', () => {
    expect(nextDelayMs('overloaded', 1, { retryAfterMs: 5000, rng: () => 1 })).toBe(1000)
  })
})

describe('retry-runaway guard, the total-elapsed ceiling', () => {
  it.each(RETRYABLE_KINDS)('worst-case total delay for %s stays at or below the ceiling', (kind) => {
    const { maxAttempts } = RETRY_POLICY[kind]
    let total = 0
    for (let attempt = 1; attempt < maxAttempts; attempt++) {
      total += nextDelayMs(kind, attempt, { rng: () => 1 }) ?? 0
    }
    expect(total).toBeLessThanOrEqual(RETRY_TOTAL_ELAPSED_CEILING_MS)
  })

  it('stays at or below the ceiling even when a provider claims an enormous retry-after on every rate-limited attempt', () => {
    const { maxAttempts } = RETRY_POLICY['rate-limited']
    let total = 0
    for (let attempt = 1; attempt < maxAttempts; attempt++) {
      total += nextDelayMs('rate-limited', attempt, { retryAfterMs: 999_999_999 }) ?? 0
    }
    expect(total).toBeLessThanOrEqual(RETRY_TOTAL_ELAPSED_CEILING_MS)
  })
})
