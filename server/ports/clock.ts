/**
 * The current time and fresh unique ids, as a single seam.
 *
 * Roughly 15 call sites across services and routes call
 * `new Date().toISOString()` directly today, and id generation for new
 * books and imports calls `randomUUID()` from node:crypto. Both make a
 * service's output different on every run, which makes its tests either
 * loose (assert "looks like an ISO string") or brittle (mock the module).
 * Routing both through one port lets a service depend on "what time is it"
 * and "give me a fresh id" as a value it receives, not a global it reaches
 * for, and lets a service test assert exact timestamps and ids by
 * injecting a controllable fake.
 *
 * server/adapters/system-clock.ts is the real adapter. The in-memory fake
 * is clock.fake.ts's createFakeClock, and the shared behavioural spec both
 * must satisfy is clock.contract.ts's describeClockContract.
 */
export interface Clock {
  /** The current instant, in the same format as `new Date().toISOString()`. */
  nowIso(): string
  /** A fresh, unique identifier, filling the role `randomUUID()` fills today. */
  newId(): string
}
