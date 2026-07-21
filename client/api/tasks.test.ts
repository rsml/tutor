import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cancelTask, subscribeToTaskEvents } from './tasks'

/**
 * cancelTask is a thin wrapper over the shared request helper, and
 * subscribeToTaskEvents pins subscribeToTasks from sse.ts to the TaskEvent
 * union, so these tests check that wiring rather than re-testing the
 * transport or the reconnect logic, which http.test.ts and sse.test.ts
 * already cover.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('cancelTask', () => {
  it('sends a DELETE to /api/tasks/:taskId', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await cancelTask('task-123')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/tasks/task-123')
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })
})

/** Stands in for the browser EventSource, which node does not provide. Mirrors the fake in sse.test.ts. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  close(): void {
    this.closed = true
  }

  static reset(): void {
    FakeEventSource.instances = []
  }

  static get latest(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1]
  }
}

describe('subscribeToTaskEvents', () => {
  beforeEach(() => {
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports each event on the stream to the callback', () => {
    const events: unknown[] = []
    subscribeToTaskEvents(e => events.push(e))

    FakeEventSource.latest.onmessage?.({
      data: '{"type":"task_progress","taskId":"t1","progress":{"current":1,"total":3,"label":"Chapter 2"}}',
    })

    expect(events).toEqual([
      { type: 'task_progress', taskId: 't1', progress: { current: 1, total: 3, label: 'Chapter 2' } },
    ])
  })

  it('closes the stream when the caller unsubscribes', () => {
    const unsubscribe = subscribeToTaskEvents(() => {})

    unsubscribe()

    expect(FakeEventSource.latest.closed).toBe(true)
  })
})
