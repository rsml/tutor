import type { GenerationJob, GenerationJobCheckpoint } from '@shared/domain.js'

/**
 * Persists in-flight background jobs so one that was still running when
 * the process died can be found and resumed at the next boot. Backs
 * server/adapters/journalled-background-tasks.ts, a decorator over
 * BackgroundTasks that calls record() when a job starts and clear() when
 * it reaches a terminal state, so a record still present at boot can only
 * mean the process ended before that terminal state was ever reached.
 *
 * record, checkpoint, and clear are synchronous so BackgroundTasks.start(),
 * report(), succeed(), fail(), and cancel() can all stay synchronous too,
 * exactly as the existing BackgroundTasks contract already requires. An
 * adapter queues its write internally and the caller never awaits it.
 * flush() is the separate seam that lets a test, or a graceful shutdown
 * path, wait for every queued write to actually land, it plays no part in
 * steady-state operation.
 *
 * One file per job, rather than a single journal file holding all of them,
 * for four reasons: it reuses the atomic writeYaml helper in fs-paths.ts
 * exactly the way every other adapter does, it turns a finished job's
 * cleanup into a single delete instead of a rewrite of a shared file, it
 * confines a corrupted record to the one job that wrote it rather than
 * risking the whole journal, and it avoids a read-modify-write race
 * between the Electron app and the MCP server when both point at the same
 * data directory.
 */
export interface JobJournal {
  /** Persists a job at the start of its run, replacing any prior record for the same id. */
  record(job: GenerationJob): void
  /** Updates only the checkpoint of an already-recorded job. A no-op for an unknown id. */
  checkpoint(jobId: string, checkpoint: GenerationJobCheckpoint): void
  /** Removes a job's record once it reaches a terminal state. A no-op for an unknown id. */
  clear(jobId: string): void
  /**
   * Every job whose record is still present. Always reports status
   * 'interrupted' regardless of what was recorded, since a record that
   * survived to be read this way can only mean the process ended before
   * clearing it.
   */
  listInterrupted(): Promise<GenerationJob[]>
  /** Resolves once every write queued so far has landed. For tests and shutdown only. */
  flush(): Promise<void>
}
