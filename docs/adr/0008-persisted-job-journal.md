# 0008. Persisted job journal with disk-truth resume

Status: Accepted
Date: 2026-07-21

## Context

Background tasks, EPUB export, cover generation, audiobook install and generation, and generating every remaining chapter, lived only in memory, tracked by `BackgroundTasks`. A restart stranded any job still running, and crash recovery could only reset a book's status rather than pick a job back up.

## Decision

[`../../server/ports/job-journal.ts`](../../server/ports/job-journal.ts) defines a `JobJournal` port, one YAML file per job under `{dataDir}/jobs/`, written through the same temp-then-rename `writeYaml` helper every other adapter uses. [`../../server/adapters/fs-job-journal.ts`](../../server/adapters/fs-job-journal.ts) is the real adapter. [`../../server/adapters/journalled-background-tasks.ts`](../../server/adapters/journalled-background-tasks.ts) composes a `JobJournal` onto an existing `BackgroundTasks` as a decorator, calling `record()` on `start()` and `clear()` on `succeed()`, `fail()`, and `cancel()`, rather than making `BackgroundTasks` itself asynchronous. The same `BackgroundTasks` contract test, unchanged, passes against the decorated adapter, which is the proof that adding persistence changed no observable behavior. At boot, [`../../server/services/resume-interrupted-jobs.ts`](../../server/services/resume-interrupted-jobs.ts) reads every surviving record after crash recovery finishes, from `runStartupTasks` in [`../../server/index.ts`](../../server/index.ts). Only `generate-all` and `generate-audiobook` auto-resume. Every other job type is marked cleanly retriable instead, either in the existing task tray or, for a chapter already mid-stream, as an interrupted generation the reader already knows how to surface. Resume never trusts the journalled checkpoint to decide what to redo. It recomputes the real start point from the book's own metadata on disk, so the checkpoint is advisory only, a progress label rather than a decision. Chapter generation restarts a whole chapter rather than resuming mid-stream, because, per [`../../server/services/chapter-generation-stream.ts`](../../server/services/chapter-generation-stream.ts), there is no way to resume a partially streamed chapter with any provider. `TUTOR_NO_AUTO_RESUME=1` is a debugging escape hatch that leaves every journal record untouched.

## Consequences

**What this buys**

- No already-saved chapter or narrated audio file is ever regenerated on resume.
- The existing `BackgroundTasks` contract test is the proof the decorator is transparent, with no test loosened to make it pass.

**What this costs**

- Resume can only restart a whole step, a chapter or an entire narration pass, never a partial one.
- A `JobJournal` instance can only checkpoint or clear a job it recorded itself, so two processes pointed at the same data directory can discover each other's interrupted jobs but not jointly manage one still running.

## Revisit when

A job type appears whose steps are not idempotent from disk, or auto-resume is observed spending money the user did not intend.
