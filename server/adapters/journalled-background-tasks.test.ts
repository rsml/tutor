import { describe, expect, it } from 'vitest'
import type { GenerationJobParams } from '@shared/domain.js'
import type { StartTaskSpec } from '../ports/background-tasks.js'
import { describeBackgroundTasksContract } from '../ports/background-tasks.contract.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { createFakeJobJournal } from '../ports/job-journal.fake.js'
import { createInMemoryBackgroundTasks } from './in-memory-background-tasks.js'
import { createJournalledBackgroundTasks } from './journalled-background-tasks.js'

// Running the UNCHANGED existing BackgroundTasks contract against this
// decorated adapter is precisely the proof that adding persistence changed
// no observable behaviour: every one of those cases was written against
// the plain in-memory adapter, and none of it had to be loosened to also
// pass here.
describeBackgroundTasksContract('journalled over in-memory', () =>
  createJournalledBackgroundTasks({
    inner: createInMemoryBackgroundTasks(),
    journal: createFakeJobJournal(),
    clock: createFakeClock(),
  }),
)

const SPEC: StartTaskSpec = { type: 'generate-epub', bookId: 'book-1', bookTitle: 'Test Book', total: 5 }

describe('createJournalledBackgroundTasks (whitebox)', () => {
  it('start writes one journal record whose id equals the returned TaskHandle.id, timestamped by the injected clock, with checkpoint none', async () => {
    const journal = createFakeJobJournal()
    const clock = createFakeClock('2026-03-01T00:00:00.000Z')
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock })

    const handle = tasks.start(SPEC)
    await journal.flush()

    const jobs = await journal.listInterrupted()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      id: handle.id,
      startedAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      checkpoint: { kind: 'none' },
    })
  })

  it('start journals a given params verbatim', async () => {
    const journal = createFakeJobJournal()
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock: createFakeClock() })
    const params: GenerationJobParams = { provider: 'anthropic', targetChapterNum: 4, voiceId: 'onyx' }

    tasks.start({ ...SPEC, params })
    await journal.flush()

    const [job] = await journal.listInterrupted()
    expect(job.params).toEqual(params)
  })

  it('start without a params journals an empty object', async () => {
    const journal = createFakeJobJournal()
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock: createFakeClock() })

    tasks.start(SPEC)
    await journal.flush()

    const [job] = await journal.listInterrupted()
    expect(job.params).toEqual({})
  })

  it('succeed clears the journal record', async () => {
    const journal = createFakeJobJournal()
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock: createFakeClock() })
    const handle = tasks.start(SPEC)

    tasks.succeed(handle.id)
    await journal.flush()

    expect(await journal.listInterrupted()).toEqual([])
  })

  it('fail clears the journal record', async () => {
    const journal = createFakeJobJournal()
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock: createFakeClock() })
    const handle = tasks.start(SPEC)

    tasks.fail(handle.id, 'boom')
    await journal.flush()

    expect(await journal.listInterrupted()).toEqual([])
  })

  // A cancelled job must not resurrect itself at the next boot, so cancel
  // clears the record exactly like succeed and fail do.
  it('cancel clears the journal record, so a cancelled job cannot resurrect itself at the next boot', async () => {
    const journal = createFakeJobJournal()
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock: createFakeClock() })
    const handle = tasks.start(SPEC)

    tasks.cancel(handle.id)
    await journal.flush()

    expect(await journal.listInterrupted()).toEqual([])
  })

  it('report never writes to the journal, even across many calls, because progress is cosmetic', async () => {
    const journal = createFakeJobJournal()
    const tasks = createJournalledBackgroundTasks({ inner: createInMemoryBackgroundTasks(), journal, clock: createFakeClock() })
    const handle = tasks.start(SPEC)
    await journal.flush()
    const afterStart = await journal.listInterrupted()

    for (let i = 0; i < 20; i++) {
      tasks.report(handle.id, i, `Step ${i}`)
    }
    await journal.flush()

    expect(await journal.listInterrupted()).toEqual(afterStart)
  })
})
