import { afterEach, describe, expect, it } from 'vitest'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { GenerationJob } from '@shared/domain.js'
import type { JobJournal } from '../ports/job-journal.js'
import { describeJobJournalContract } from '../ports/job-journal.contract.js'
import { createFsJobJournal } from './fs-job-journal.js'

// Runs the shared JobJournal contract against the real filesystem adapter,
// over a fresh temp directory per subject, plus real-adapter-only cases
// about the on-disk layout that no fake needs to reproduce.

const tempDirs: string[] = []

async function freshDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tutor-fs-job-journal-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeSubject(): Promise<JobJournal> {
  const dataDir = await freshDataDir()
  return createFsJobJournal({ dataDir })
}

describeJobJournalContract('real fs adapter', makeSubject)

const JOB: GenerationJob = {
  id: 'job-1',
  type: 'generate-chapter',
  bookId: 'book-1',
  bookTitle: 'Test Book',
  status: 'running',
  checkpoint: { kind: 'none' },
  params: {},
  startedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('createFsJobJournal', () => {
  it('records land as one file per job at {dataDir}/jobs/{jobId}.yml', async () => {
    const dataDir = await freshDataDir()
    const journal = createFsJobJournal({ dataDir })

    journal.record(JOB)
    await journal.flush()

    const raw = await readFile(join(dataDir, 'jobs', `${JOB.id}.yml`), 'utf-8')
    const parsed = parseYaml(raw) as Record<string, unknown>
    expect(parsed.id).toBe(JOB.id)
    expect(parsed.bookId).toBe(JOB.bookId)
  })

  it('a second journal instance built over the same dataDir sees a job the first recorded, which is the property that makes this survive a restart at all', async () => {
    const dataDir = await freshDataDir()
    const first = createFsJobJournal({ dataDir })
    first.record(JOB)
    await first.flush()

    const second = createFsJobJournal({ dataDir })
    const jobs = await second.listInterrupted()
    expect(jobs.some((j) => j.id === JOB.id)).toBe(true)
  })

  it('deletes an unparseable .yml in jobs/ and skips it, rather than throwing, while still returning the valid jobs beside it', async () => {
    // Jobs are throwaway state: a record that cannot even be parsed can
    // never be resumed, so discarding it is correct here, where discarding
    // a corrupt book never would be.
    const dataDir = await freshDataDir()
    const jobsDir = join(dataDir, 'jobs')
    await mkdir(jobsDir, { recursive: true })
    await writeFile(join(jobsDir, 'corrupt.yml'), 'key: [unterminated flow sequence', 'utf-8')

    const journal = createFsJobJournal({ dataDir })
    journal.record(JOB)
    await journal.flush()

    const jobs = await journal.listInterrupted()
    expect(jobs.map((j) => j.id)).toEqual([JOB.id])
    await expect(access(join(jobsDir, 'corrupt.yml'))).rejects.toThrow()
  })

  it('ignores a non-.yml file in jobs/ and leaves it alone', async () => {
    const dataDir = await freshDataDir()
    const jobsDir = join(dataDir, 'jobs')
    await mkdir(jobsDir, { recursive: true })
    await writeFile(join(jobsDir, 'notes.txt'), 'stray file, not a job', 'utf-8')

    const journal = createFsJobJournal({ dataDir })
    const jobs = await journal.listInterrupted()

    expect(jobs).toEqual([])
    await expect(access(join(jobsDir, 'notes.txt'))).resolves.toBeUndefined()
  })

  it('listInterrupted resolves to an empty array when there is no jobs/ directory', async () => {
    const dataDir = await freshDataDir()
    const journal = createFsJobJournal({ dataDir })

    expect(await journal.listInterrupted()).toEqual([])
  })
})
