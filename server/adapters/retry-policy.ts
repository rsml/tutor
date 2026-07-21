import type { TextGenerationErrorKind } from '../ports/text-generation.js'

/**
 * This module decides how many times, and how long to wait between, each
 * TextGenerationError kind gets retried. It lives next to the adapter
 * rather than the port, because retrying is this adapter's own policy, not
 * a port-level guarantee. Delays use full jitter, `rng() * min(exponential
 * backoff, RETRY_MAX_DELAY_MS)`, rather than plain exponential backoff, so
 * that many simultaneous retries spread out instead of retrying in
 * lockstep. `RETRY_TOTAL_ELAPSED_CEILING_MS` is a second, independent
 * bound on top of each kind's `maxAttempts`, so a future change to the
 * per-kind table cannot silently make total retry time unbounded. `rng` is
 * injected, defaulting to `Math.random`, so the policy is deterministically
 * testable.
 *
 * A shared helper, not an adapter. It implements no port of its own, and
 * today only ai-sdk-text-generation.ts imports it.
 */

/**
 * One error kind's retry budget. maxAttempts of 1 means never retried.
 * baseDelayMs is what nextDelayMs's exponential backoff multiplies from.
 */
export interface RetryRule {
  maxAttempts: number
  baseDelayMs: number
}

/**
 * Upper bound on any single computed delay, including a rate-limited
 * retry-after. Keeps one huge backoff or provider-supplied delay from
 * stalling a retry loop on its own.
 */
export const RETRY_MAX_DELAY_MS = 20_000
/**
 * Second, independent ceiling on total elapsed retry time, on top of each
 * kind's own maxAttempts. See the file header for why both bounds exist.
 */
export const RETRY_TOTAL_ELAPSED_CEILING_MS = 60_000

/**
 * Per-kind retry budgets. auth-failed, content-refused, and unknown all
 * get maxAttempts of 1, since none of the three improves by waiting and
 * retrying.
 */
export const RETRY_POLICY: Record<TextGenerationErrorKind, RetryRule> = {
  'rate-limited': { maxAttempts: 4, baseDelayMs: 1000 },
  overloaded: { maxAttempts: 3, baseDelayMs: 1000 },
  'network-failed': { maxAttempts: 3, baseDelayMs: 200 },
  'timed-out': { maxAttempts: 2, baseDelayMs: 1000 },
  'auth-failed': { maxAttempts: 1, baseDelayMs: 0 },
  'content-refused': { maxAttempts: 1, baseDelayMs: 0 },
  unknown: { maxAttempts: 1, baseDelayMs: 0 },
}

/**
 * Computes the delay before the next attempt, given that the 1-based
 * `attempt` just failed with `kind`. Returns `null` to mean stop retrying.
 * A kind with `maxAttempts: 1` never retries, because its first and only
 * attempt always reaches the cap.
 */
export function nextDelayMs(
  kind: TextGenerationErrorKind,
  attempt: number,
  opts?: { retryAfterMs?: number; rng?: () => number },
): number | null {
  const rule = RETRY_POLICY[kind]
  if (attempt >= rule.maxAttempts) return null

  if (kind === 'rate-limited' && opts?.retryAfterMs !== undefined) {
    return Math.min(opts.retryAfterMs, RETRY_MAX_DELAY_MS)
  }

  const rng = opts?.rng ?? Math.random
  const backoff = Math.min(rule.baseDelayMs * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS)
  return rng() * backoff
}
