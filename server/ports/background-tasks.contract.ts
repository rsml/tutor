import { describe, expect, it, vi } from 'vitest'
import type { TaskEvent } from '@shared/events.js'
import type { BackgroundTasks, StartTaskSpec } from './background-tasks.js'

const SPEC: StartTaskSpec = { type: 'generate-epub', bookId: 'book-1', bookTitle: 'Test Book', total: 5 }

/**
 * Mirrors TASK_CLEANUP_DELAY_MS in server/constants.ts. This is a pin, not
 * a guess: the eviction test below asserts a finished task survives one
 * millisecond short of this delay and is gone one millisecond after it.
 */
const EVICTION_DELAY_MS = 60_000

/**
 * Behavior every BackgroundTasks implementation must satisfy. Written
 * against the BackgroundTasks surface only, so this suite can run against
 * the fake now and the real in-memory adapter later.
 */
export function describeBackgroundTasksContract(label: string, makeSubject: () => BackgroundTasks | Promise<BackgroundTasks>) {
  describe(`BackgroundTasks contract (${label})`, () => {
    it('a started task appears in list and get, running with zero progress', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      const got = subject.get(handle.id)
      expect(got).toBeDefined()
      expect(got?.status).toBe('running')
      expect(got?.type).toBe(SPEC.type)
      expect(got?.bookId).toBe(SPEC.bookId)
      expect(got?.bookTitle).toBe(SPEC.bookTitle)
      expect(got?.progress.current).toBe(0)
      expect(got?.progress.total).toBe(SPEC.total)

      expect(subject.list().some(t => t.id === handle.id)).toBe(true)
    })

    it('the handle exposes a signal and never an AbortController', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      expect(handle.signal).toBeInstanceOf(AbortSignal)
      expect(handle.signal.aborted).toBe(false)
      // Exactly id and signal: nothing that could let a caller trigger
      // cancellation itself, only observe it.
      expect(Object.keys(handle).sort()).toEqual(['id', 'signal'])
    })

    it('report updates progress on a running task', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      subject.report(handle.id, 3, 'Halfway there')

      const got = subject.get(handle.id)
      expect(got?.progress).toEqual({ current: 3, total: SPEC.total, label: 'Halfway there' })
    })

    it('succeed moves the task to done and records the result', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      subject.succeed(handle.id, { path: '/out.epub' })

      const got = subject.get(handle.id)
      expect(got?.status).toBe('done')
      expect(got?.result).toEqual({ path: '/out.epub' })
    })

    it('fail moves the task to error and records the message', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      subject.fail(handle.id, 'boom')

      const got = subject.get(handle.id)
      expect(got?.status).toBe('error')
      expect(got?.error).toBe('boom')
    })

    it('cancel moves a running task to cancelled, returns true, and aborts its signal', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      const result = subject.cancel(handle.id)

      expect(result).toBe(true)
      expect(subject.get(handle.id)?.status).toBe('cancelled')
      expect(handle.signal.aborted).toBe(true)
    })

    it('cancel returns false for a task that already reached a terminal status', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)
      subject.succeed(handle.id)

      expect(subject.cancel(handle.id)).toBe(false)
      expect(subject.get(handle.id)?.status).toBe('done')
    })

    it('cancel returns false for an unknown task id', async () => {
      const subject = await makeSubject()
      expect(subject.cancel('no-such-task')).toBe(false)
    })

    it('findActive finds a running task and stops finding it once the task finishes', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      expect(subject.findActive(SPEC.bookId, SPEC.type)?.id).toBe(handle.id)

      subject.succeed(handle.id)

      expect(subject.findActive(SPEC.bookId, SPEC.type)).toBeUndefined()
    })

    it('findActive without a type matches any running type for the book; a mismatched type does not match', async () => {
      const subject = await makeSubject()
      const handle = subject.start(SPEC)

      expect(subject.findActive(SPEC.bookId)?.id).toBe(handle.id)
      expect(subject.findActive(SPEC.bookId, 'generate-cover')).toBeUndefined()
      expect(subject.findActive('some-other-book', SPEC.type)).toBeUndefined()
    })

    it('subscribe receives task_created, task_progress, and task_done in order, and stops after unsubscribe', async () => {
      const subject = await makeSubject()
      const events: TaskEvent[] = []
      const unsubscribe = subject.subscribe(event => events.push(event))

      const handle = subject.start(SPEC)
      subject.report(handle.id, 1, 'Working')
      subject.succeed(handle.id, { ok: true })

      expect(events.map(e => e.type)).toEqual(['task_created', 'task_progress', 'task_done'])

      unsubscribe()
      const handle2 = subject.start(SPEC)
      subject.succeed(handle2.id)

      expect(events).toHaveLength(3)
    })

    it('subscribe receives task_error and task_cancelled for those transitions', async () => {
      const subject = await makeSubject()
      const events: TaskEvent[] = []
      subject.subscribe(event => events.push(event))

      const failed = subject.start(SPEC)
      subject.fail(failed.id, 'boom')

      const cancelled = subject.start(SPEC)
      subject.cancel(cancelled.id)

      expect(events.map(e => e.type)).toEqual([
        'task_created', 'task_error',
        'task_created', 'task_cancelled',
      ])
    })

    it('evicts a finished task after the cleanup delay, and not a moment before', async () => {
      vi.useFakeTimers()
      try {
        const subject = await makeSubject()
        const handle = subject.start(SPEC)
        subject.succeed(handle.id)

        expect(subject.get(handle.id)).toBeDefined()

        vi.advanceTimersByTime(EVICTION_DELAY_MS - 1)
        expect(subject.get(handle.id)).toBeDefined()

        vi.advanceTimersByTime(1)
        expect(subject.get(handle.id)).toBeUndefined()
        expect(subject.list().some(t => t.id === handle.id)).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  })
}
