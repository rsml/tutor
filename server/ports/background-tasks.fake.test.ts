import { describe, expect, it } from 'vitest'
import { createFakeBackgroundTasks } from './background-tasks.fake.js'
import { describeBackgroundTasksContract } from './background-tasks.contract.js'

describeBackgroundTasksContract('fake', () => createFakeBackgroundTasks())

describe('createFakeBackgroundTasks (whitebox)', () => {
  it('gives independent tasks to independently created fakes', () => {
    const a = createFakeBackgroundTasks()
    const b = createFakeBackgroundTasks()

    const handle = a.start({ type: 'generate-cover', bookId: 'book-1', bookTitle: 'A', total: 1 })

    expect(a.get(handle.id)).toBeDefined()
    expect(b.get(handle.id)).toBeUndefined()
    expect(b.list()).toEqual([])
  })
})
