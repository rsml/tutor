import type { GenerationJob } from '@shared/domain.js'
import type { JobJournal } from './job-journal.js'

/**
 * In-memory JobJournal. Holds records in a Map for the lifetime of the
 * fake and never touches disk, so a test gets a clean journal regardless
 * of what the real filesystem holds. Every write here already happens
 * synchronously, so flush() has nothing to wait for and resolves at once.
 */
export function createFakeJobJournal(): JobJournal {
  const jobs = new Map<string, GenerationJob>()

  return {
    record(job) {
      jobs.set(job.id, { ...job })
    },

    checkpoint(jobId, checkpoint) {
      const job = jobs.get(jobId)
      if (!job) return
      jobs.set(jobId, { ...job, checkpoint })
    },

    clear(jobId) {
      jobs.delete(jobId)
    },

    async listInterrupted() {
      return Array.from(jobs.values()).map((job) => ({ ...job, status: 'interrupted' }))
    },

    async flush() {
      // Nothing is ever queued, every write above already happened inline.
    },
  }
}
