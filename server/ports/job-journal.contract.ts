import { describe, expect, it } from 'vitest'
import type { GenerationJob, GenerationJobCheckpoint } from '@shared/domain.js'
import type { JobJournal } from './job-journal.js'

const JOB: GenerationJob = {
  id: 'job-1',
  type: 'generate-chapter',
  bookId: 'book-1',
  bookTitle: 'Test Book',
  status: 'running',
  checkpoint: { kind: 'none' },
  params: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', targetChapterNum: 3 },
  startedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/**
 * Behavior every JobJournal implementation must satisfy. Written against
 * the JobJournal surface only, so this suite can run against the fake now
 * and the real filesystem adapter later. Every case awaits subject.flush()
 * before asserting on listInterrupted(), since record/checkpoint/clear are
 * synchronous and may queue their write rather than complete it inline.
 */
export function describeJobJournalContract(label: string, makeSubject: () => JobJournal | Promise<JobJournal>) {
  describe(`JobJournal contract (${label})`, () => {
    it('a recorded job appears in listInterrupted with every field preserved, including params exactly', async () => {
      const subject = await makeSubject()
      subject.record(JOB)
      await subject.flush()

      const jobs = await subject.listInterrupted()
      const found = jobs.find((j) => j.id === JOB.id)
      expect(found).toBeDefined()
      expect(found).toMatchObject({
        id: JOB.id,
        type: JOB.type,
        bookId: JOB.bookId,
        bookTitle: JOB.bookTitle,
        checkpoint: JOB.checkpoint,
        params: JOB.params,
        startedAt: JOB.startedAt,
        updatedAt: JOB.updatedAt,
      })
    })

    // A record still present on disk can only mean the process died before
    // clear() ran, so the reader reports the truth rather than echoing the
    // status written at record time. Both values in the union are recorded
    // here, and both must read back as 'interrupted', which pins that the
    // reader overwrites rather than passes through.
    it("a recorded job comes back with status 'interrupted', whatever status it was recorded with", async () => {
      const subject = await makeSubject()
      subject.record({ ...JOB, id: 'job-a', status: 'running' })
      subject.record({ ...JOB, id: 'job-b', status: 'interrupted' })
      await subject.flush()

      const jobs = await subject.listInterrupted()
      expect(jobs.find((j) => j.id === 'job-a')?.status).toBe('interrupted')
      expect(jobs.find((j) => j.id === 'job-b')?.status).toBe('interrupted')
    })

    it('clear removes a job so listInterrupted no longer contains it', async () => {
      const subject = await makeSubject()
      subject.record(JOB)
      subject.clear(JOB.id)
      await subject.flush()

      const jobs = await subject.listInterrupted()
      expect(jobs.some((j) => j.id === JOB.id)).toBe(false)
    })

    it('checkpoint updates the stored checkpoint and leaves every other field intact', async () => {
      const subject = await makeSubject()
      subject.record(JOB)

      const next: GenerationJobCheckpoint = { kind: 'chapters', through: 3 }
      subject.checkpoint(JOB.id, next)
      await subject.flush()

      const jobs = await subject.listInterrupted()
      const found = jobs.find((j) => j.id === JOB.id)
      expect(found?.checkpoint).toEqual(next)
      expect(found).toMatchObject({
        id: JOB.id,
        type: JOB.type,
        bookId: JOB.bookId,
        bookTitle: JOB.bookTitle,
        params: JOB.params,
        startedAt: JOB.startedAt,
      })
    })

    it('checkpoint and clear on an unknown id are no-ops and do not throw', async () => {
      const subject = await makeSubject()
      expect(() => subject.checkpoint('no-such-job', { kind: 'none' })).not.toThrow()
      expect(() => subject.clear('no-such-job')).not.toThrow()
      await subject.flush()

      expect(await subject.listInterrupted()).toEqual([])
    })

    it('two different jobs are independent, clearing one leaves the other', async () => {
      const subject = await makeSubject()
      const other: GenerationJob = { ...JOB, id: 'job-2', bookId: 'book-2' }
      subject.record(JOB)
      subject.record(other)

      subject.clear(JOB.id)
      await subject.flush()

      const jobs = await subject.listInterrupted()
      expect(jobs.some((j) => j.id === JOB.id)).toBe(false)
      expect(jobs.some((j) => j.id === other.id)).toBe(true)
    })

    it('flush resolves even with nothing queued', async () => {
      const subject = await makeSubject()
      await expect(subject.flush()).resolves.toBeUndefined()
    })
  })
}
