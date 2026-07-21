import { describe, expect, it } from 'vitest'
import { createInMemoryBackgroundTasks } from './in-memory-background-tasks.js'
import { describeBackgroundTasksContract } from '../ports/background-tasks.contract.js'

describeBackgroundTasksContract('real in-memory adapter', () => createInMemoryBackgroundTasks())

describe('createInMemoryBackgroundTasks (whitebox)', () => {
  it('gives independent tasks to independently created instances, proving no import-time shared state', () => {
    const a = createInMemoryBackgroundTasks()
    const b = createInMemoryBackgroundTasks()

    const handle = a.start({ type: 'generate-cover', bookId: 'book-1', bookTitle: 'A', total: 1 })

    expect(a.get(handle.id)).toBeDefined()
    expect(b.get(handle.id)).toBeUndefined()
    expect(b.list()).toEqual([])
  })

  it('uses the injected newId instead of generating a random one', () => {
    let calls = 0
    const instance = createInMemoryBackgroundTasks({ newId: () => `deterministic-${++calls}` })

    const first = instance.start({ type: 'generate-cover', bookId: 'book-1', bookTitle: 'A', total: 1 })
    const second = instance.start({ type: 'generate-cover', bookId: 'book-1', bookTitle: 'A', total: 1 })

    expect(first.id).toBe('deterministic-1')
    expect(second.id).toBe('deterministic-2')
  })
})
