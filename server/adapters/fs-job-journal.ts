import { readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GenerationJobSchema, type GenerationJob } from '@shared/domain.js'
import type { JobJournal } from '../ports/job-journal.js'
import { readYaml, writeYaml } from './fs-paths.js'

/**
 * The real JobJournal adapter, one YAML file per job under
 * {dataDir}/jobs/{jobId}.yml.
 *
 * Keeps an in-memory Map alongside the files, but only as a write-side
 * mirror of the jobs this instance itself has recorded, never as a read
 * cache. checkpoint() needs every field of a job to rewrite its file,
 * since writeYaml always overwrites the whole document, and the Map is
 * what lets it merge in the new checkpoint and enqueue that write
 * synchronously instead of reading the file back first. listInterrupted()
 * never consults the Map, it always re-reads {dataDir}/jobs/ from disk,
 * because a job recorded by a different JobJournal instance, such as the
 * Electron app and the MCP server pointed at the same data directory, or
 * by this same process before an earlier restart, can only be discovered
 * that way, this instance's Map was never populated for it.
 *
 * Every write is appended to a single promise chain so two writes for the
 * same job can never land out of order. flush() is exactly that chain,
 * and the chain recovers from a failed write rather than staying rejected
 * forever, so one bad write cannot silently block every job after it.
 *
 * The factory itself performs no I/O, matching every other adapter
 * server/composition-root.ts constructs eagerly at startup.
 */
export function createFsJobJournal(opts: { dataDir: string }): JobJournal {
  const { dataDir } = opts
  const jobsDir = join(dataDir, 'jobs')
  const pathFor = (jobId: string): string => join(jobsDir, `${jobId}.yml`)

  // This instance's own pending writes only, see the header comment.
  const mirror = new Map<string, GenerationJob>()
  let writeChain: Promise<void> = Promise.resolve()

  const enqueue = (task: () => Promise<void>): void => {
    writeChain = writeChain.then(task, task)
  }

  return {
    record(job) {
      mirror.set(job.id, job)
      enqueue(() => writeYaml(pathFor(job.id), job))
    },

    checkpoint(jobId, checkpoint) {
      const job = mirror.get(jobId)
      if (!job) return
      const updated: GenerationJob = { ...job, checkpoint }
      mirror.set(jobId, updated)
      enqueue(() => writeYaml(pathFor(jobId), updated))
    },

    clear(jobId) {
      mirror.delete(jobId)
      enqueue(() => rm(pathFor(jobId), { force: true }))
    },

    async listInterrupted(): Promise<GenerationJob[]> {
      if (!existsSync(jobsDir)) return []

      const jobs: GenerationJob[] = []
      for (const entry of await readdir(jobsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.yml')) continue
        const path = join(jobsDir, entry.name)
        try {
          const job = await readYaml(path, GenerationJobSchema)
          jobs.push({ ...job, status: 'interrupted' })
        } catch {
          // Jobs are throwaway state: a record that is not even valid YAML,
          // or not a valid GenerationJob, can never be resumed, so
          // discarding it here is correct in a way discarding a corrupt
          // book never would be.
          await rm(path, { force: true })
        }
      }
      return jobs
    },

    flush(): Promise<void> {
      return writeChain
    },
  }
}
