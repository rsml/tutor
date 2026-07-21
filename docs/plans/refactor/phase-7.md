# Phase 7 — Durability, Migrations, and a Typed AI Error Taxonomy

> **PARALLEL-EXECUTION ADDENDUM (architect, owner-approved):** this phase develops CONCURRENTLY with Phase 6 (E2E), which runs in its own worktree and MERGES FIRST. This phase owns `server/`, `shared/`, and the client seams named below; Phase 6 owns `e2e/` and its three config lines. Consequences for the task list: S10's E2E assertion and S13's journey-h parameterization are DEFERRED to a final integration step after Phase 6 merges, when this branch rebases onto master, runs the full suite, adds those two items, and only then gates and opens its PR. Until then the protection is the unit, contract, and fixture tests plus Phase 6's walking skeleton. Development risk without the full net is accepted by the owner for the schedule.

## Objective

Three owner-sanctioned behavior improvements, landed on top of a hexagonal server (Phase 2) and protected by the committed E2E suite (Phase 6). The behavior-preservation rule is lifted only for what is listed under **Sanctioned behavior changes** below; everything else stays byte-identical. Scope is local-single-user: a journal file, not a queue; a startup pass, not a scheduler.

## 0. Reconciled before execution

Facts checked against `master` @ `e8a5dd1` before any code was written. The plan below is corrected in place, so the diff between plan and reality is never silent.

1. **Test baseline.** `pnpm test` on `master` @ `e8a5dd1` is 118 files and 1110 tests, all green. The gate is measured against that number plus this phase's additions, and against Phase 6's count once its suite merges.
2. **Every module rename the plan hedged on has already landed.** `server/services/chapter-generation-stream.ts`, `server/services/generate-all-chapters.ts`, and `server/services/generate-audiobook.ts` all exist under those names. No alternate name needs carrying.
3. **The `.gitignore` gotcha is confirmed live.** `git check-ignore -v server/migrations/__fixtures__/v1-library/books/book-a/meta.yml` exits 0 and names `.gitignore:5:books/`. S1 anchors it to `/books/` and re-verifies before anything depends on fixtures.
4. **`GenerationStatus` is a discriminated union**, `{ active: false } | { active: true, chapterNum, stage, contentLength }`. The new `error` field belongs on the active variant, not on the union.
5. **`generate-chapter` is not a `TaskType`.** The tray's `TaskType` has exactly five members and single-chapter generation never enters `BackgroundTasks` at all, it runs through `ChapterGenerationStream`. So the journal cannot learn about it from the `BackgroundTasks` decorator. The journal gets its own six-member `GenerationJobType`, and `ChapterGenerationStream` records and clears its own job. `TaskType` is left untouched, and a type-level test asserts every `TaskType` is a `GenerationJobType`.
6. **`shared/domain.ts` is a single module, not a directory.** `schemaVersion`, `CURRENT_BOOK_SCHEMA_VERSION`, `CURRENT_PROFILE_SCHEMA_VERSION`, and `GenerationJobSchema` all land in that file. `shared/responses.ts` already imports from it, so `domain.ts` must not import back from `responses.ts`.
7. **`startServer` builds a second, independent `createPorts(overrides)`** for crash recovery. The migrator and the resume pass read from that same second call, so all three boot steps share one set of ports.

---

## A. Schema versioning + migrations

**Version scope: two counters, not one.** `schemaVersion` on `meta.yml` versions the whole book directory (meta, toc, progress, feedback, quizzes, summaries, references); `schemaVersion` on `learning-profile.yml` versions the profile independently, because the profile exists with zero books. Rejected a library-wide `library.yml` counter: a book folder is portable (EPUB import creates one, users copy them between machines), and a per-book version travels with it. `meta.yml` is the right host because `listBooks()` already treats its presence as "this directory is a book".

**Absent field = version 1.** Current libraries are v1 and need no write to be readable.

**Ship one real migration, not an empty pipeline.** `CURRENT_BOOK_SCHEMA_VERSION = 2`; migration `001-materialize-defaults` writes out the fields the current Zod schemas silently backfill at read time (`tags`, `audioGeneratedChapters`, `skills` on the profile) and stamps the version. That makes what is on disk self-describing instead of implied by whichever `.default()` happened to be in the code, which is the entire argument for schema versioning, and it gives the fixture test something real to assert.

**Run point: eager, in `startServer`, before `recoverFromCrash()`.** `buildServer()` must stay mutation-free (a P0/P4 invariant, the routes-doc generator and every inject test depend on it), so migration cannot live there. `startServer` already owns the one boot mutation. Order is load-bearing: `recoverFromCrash` reads and writes `BookMeta` through the *current* Zod schema, so an unmigrated book would be skipped by its `listBooks` try/catch. Rejected lazy-per-read: it turns every GET into a potential write, spreads migration across the adapter, and races the MCP server, which writes the same data dir concurrently.

**Read-side guard, not a lazy migrator.** `readYaml` gains a version pre-check: a `schemaVersion` *greater* than current throws a typed `SchemaTooNewError` (the user downgraded the app) rather than letting Zod mangle it. A book folder dropped in *while the app runs* is migrated at next boot; until then `listBooks` skips it with its existing warning. Documented limitation, not a bug.

**Code shape.** Pure steps in `server/migrations/book/001-materialize-defaults.ts` (`(raw: unknown) => unknown`, no `fs`), ordered in `server/migrations/book/index.ts`, chained by `server/migrations/migrate.ts::migrateForward(raw, from, to, steps)`. The I/O half is a new **`LibraryMigrator` port** (`migrate(): Promise<MigrationReport>`) with `server/adapters/fs-library-migrator.ts` as its only adapter, wired in `composition-root.ts` and overridable so E2E boots past it. A port, not a service, because migration reads *below* `BookRepository`, raw YAML that by definition does not validate, and because `ArtifactStore.recoverFromCrash()` already sets the precedent for a startup-mutation method behind a port. Writes go through the existing `writeYaml` temp-then-rename helper in `adapters/fs-paths.ts`.

**Recipe (goes in `server/migrations/README.md`):** bump the constant, edit the schema in `shared/domain.ts`, add `NNN-name.ts`, commit a fixture library at the previous version, add the round-trip test. A chain-integrity test (`steps` are contiguous and `steps.length === CURRENT - 1`) makes forgetting a step a test failure.

---

## B. Persisted generation jobs

**Journal: one file per job at `{dataDir}/jobs/{jobId}.yml`.** Chosen over a single journal file because it reuses `writeYaml`'s atomic write exactly, avoids read-modify-write races between the Electron app and the MCP server on a shared data dir, makes completion an `rm`, and confines corruption to one job. Jobs are throwaway state, so the journal is not migrated: an unparseable record is deleted with a warning.

**Two ports, composed, not one port made async.** Keep `BackgroundTasks` exactly as it is (synchronous `start()` returning a `TaskHandle`, contract test unchanged). Add `server/ports/job-journal.ts` (`record`, `checkpoint`, `clear`, `listInterrupted`, `flush`) and `server/adapters/fs-job-journal.ts`. Then `server/adapters/journalled-background-tasks.ts` decorates the in-memory adapter with the journal. The existing `describeBackgroundTasksContract` runs against the decorated adapter too, which *is* the proof that persistence is transparent. `flush()` exists for tests and shutdown only.

**Record shape** (`GenerationJobSchema`, `shared/domain.ts` alongside `AudiobookManifest`): `id`, `type`, `bookId`, `bookTitle`, `total`, `startedAt`, `updatedAt`, `status: 'running' | 'interrupted'`, `checkpoint` (discriminated: `{kind:'none'}` | `{kind:'chapters', through:number}` | `{kind:'narration-complete'}`), and `params`, the request body needed to restart (provider, model, quizModel, quizProvider, quizLength; voiceId, speed). No API key is ever journalled; keys stay in the `KeyVault`.

**Per-type policy.** Every type is journalled uniformly (one code path); only the recovery handler differs.

| Type | On boot | Why |
|---|---|---|
| `generate-audiobook` | **auto-resume** | Longest job, local TTS so re-running costs nothing but time, already checkpointed per chapter |
| `generate-all` | **auto-resume** | Explicit unfinished user intent; idempotent at chapter granularity |
| `generate-epub`, `generate-cover`, `install-audiobook` | mark `error: "Interrupted by restart"` | Short or cheap; the user re-clicks the button that already exists |
| `generate-chapter` (journal-only, never a tray task) | seed the generation hub with a terminal `error` state | Surfaces through the reader's existing `generation-error` phase |

**The idempotency rule that makes resume safe: disk is the truth, the checkpoint is advisory.** `generate-all` resume recomputes `startFrom = meta.generatedUpTo + 1` by reading `meta.yml`, never from the journal. Audiobook resume skips chapters via `meta.audioGeneratedChapters` and `artifactStore.chapterAudioExists()`. The checkpoint only seeds the progress label. A stale or wrong checkpoint therefore cannot cause a regeneration.

**Boot sequence in `startServer`:** `migrate()` then `recoverFromCrash()` then `resumeInterruptedJobs()`. Recovery flips `generating` to `reading`; resume then legitimately flips it back for the jobs it restarts. `TUTOR_NO_AUTO_RESUME=1` disables auto-resume; every resume logs.

**Zero new UI, verified against real client seams.** Resumed jobs re-enter `BackgroundTasks`, so `GET /api/tasks/stream` and `client/hooks/useBackgroundTasks.ts` render them as ordinary running tasks. The `generate-chapter` case needs one small client change: `GenerationStatus` gains `error?: string` on its active variant (`shared/responses.ts`), and `client/features/reader/hooks/useGenerationResume.ts`, which today early-returns on `gen.stage === 'error'`, sets the generation error and the `generation-error` phase, reusing the retry affordance already in the reader.

---

## C. Typed AI error taxonomy

**`TextGenerationError`** in `server/ports/text-generation.ts` (precedent: `NotFoundError` on `book-repository.ts`): `kind`, `reason` (human, safe to display), `retryable`, `retryAfterMs?`, `cause`. `TextGenerationErrorKind` is mirrored as a plain string union in `shared/responses.ts` so the client can switch on it without importing zod.

**Mapping, in `server/adapters/ai-sdk-text-generation.ts`:**

- `LoadAPIKeyError`, the adapter's own "No API key configured", `APICallError.statusCode` 401/403 → **AuthFailed**
- 429 → **RateLimited**, reading `retry-after` off `APICallError.responseHeaders`
- 500/502/503/529 → **Overloaded**; 408/504 → **TimedOut**
- `TypeError: fetch failed`, or `cause.code` in `ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|UND_ERR_*` → **NetworkFailed**
- content-filter finish reason, Anthropic `stop_reason: 'refusal'`, `NoObjectGeneratedError` with `finishReason === 'content-filter'` → **ContentRefused**
- everything else, including schema misses (`NoObjectGeneratedError`, `TypeValidationError`, `JSONParseError`, which `experimental_repairText` already covers) → **Unknown**

**Cancellation is not an error class.** The adapter composes `AbortSignal.any([caller, AbortSignal.timeout()])`. On abort, check the timeout signal: if it fired, throw `TimedOut`; if the *caller's* signal fired, rethrow the original abort untouched, so the `if (signal.aborted) return` paths in generate-all and audiobook still work.

**Retry inside the adapter.** `RETRY_POLICY` and a pure `nextDelayMs(kind, attempt, retryAfterMs, rng)` in `server/adapters/retry-policy.ts`, unit-tested with an injected rng and an injected `sleep`. RateLimited: honor `retry-after`, else exponential with full jitter, 4 attempts. Overloaded: 3. NetworkFailed: 3, 200ms base. TimedOut: 1 extra. AuthFailed, ContentRefused, and Unknown never retry. Caps: attempts *and* a total-elapsed ceiling.

**Two things that will bite if missed.** (1) The AI SDK retries internally (`maxRetries`, default 2). Left on, that multiplies to 12 provider calls. Set `maxRetries: 0` on every SDK call in this adapter and gate it with a grep. (2) `streamText` returns an `AsyncIterable`: retrying after a chunk has been yielded duplicates text on screen. Retry only failures raised **before the first chunk is emitted**; once `emitted === true`, propagate.

**Surfacing.** HTTP error bodies gain `kind` (`http/error-handler.ts` branch); `StreamErrorEvent` in `shared/events.ts` gains `kind?` (purely additive, the client already reads `message`). `client/api/http.ts`'s `ApiError` already carries the parsed body, so `err.body.kind` needs no change to the fetch primitive. The one payoff worth wiring: an `AuthFailed` kind routes the reader to the missing-API-key dialog that already exists, instead of a generic toast.

---

## Implementer tasks

TDD order is literal: every `test:` commit precedes or accompanies its implementation commit.

| # | Task | Acceptance |
|---|---|---|
| **S1** | Anchor `.gitignore` `books/` to `/books/`; commit fixture libraries `server/migrations/__fixtures__/{v1-library, v1-profile-only, v1-corrupt-book}` | `git check-ignore` exits 1 on a fixture path; `git status` shows them tracked |
| **S2** | *Tests first.* Pure migration tests: `migrateForward` chain, contiguity and `CURRENT - 1` invariant, `001` step over each fixture | Red against absent modules |
| **S3** | `shared/domain.ts` `schemaVersion` plus `CURRENT_*_SCHEMA_VERSION`; `server/migrations/**` pure steps; `migrate.ts` | S2 green; `pnpm typecheck` clean |
| **S4** | *Tests first.* `LibraryMigrator` contract test: copy fixture to `mkdtemp`, migrate, assert stamped, idempotent on re-run, `SchemaTooNewError` on v99, corrupt book reported not thrown | Red |
| **S5** | `ports/library-migrator.ts` plus fake plus `adapters/fs-library-migrator.ts`; wire into `createPorts`; call from `startServer` **before** `recoverFromCrash` | S4 green; `buildServer` still performs zero writes (assert with a read-only temp dir) |
| **S6** | *Tests first.* `JobJournal` contract test (fake and real over a temp dir) plus `describeBackgroundTasksContract` re-run against the decorated adapter | Red |
| **S7** | `ports/job-journal.ts`, `adapters/fs-job-journal.ts`, `adapters/journalled-background-tasks.ts`; `GenerationJobSchema`; compose in `createPorts` | S6 green; existing BackgroundTasks contract unchanged |
| **S8** | *Tests first.* `resume-interrupted-jobs.test.ts`: generate-all resumes from `generatedUpTo + 1` never earlier; audiobook skips narrated chapters; epub, cover, and install become `error`; `generate-chapter` seeds hub error; `TUTOR_NO_AUTO_RESUME=1` no-ops | Red |
| **S9** | `services/resume-interrupted-jobs.ts`; checkpoint calls in `generate-all-chapters.ts` and `generate-audiobook.ts`; `startServer` hook | S8 green; manual: kill mid-generate-all, restart, no chapter regenerated |
| **S10** | `GenerationStatus.error` plus `useGenerationResume` error phase | E2E: an interrupted chapter shows the existing retry panel |
| **S11** | *Tests first.* Taxonomy contract block on `text-generation.contract.ts`; `retry-policy.test.ts` (pure, injected rng); mapping tests over synthesized `APICallError`s | Red |
| **S12** | `TextGenerationError` plus `retry-policy.ts` plus adapter mapping and retry plus `maxRetries: 0` plus no-retry-after-first-chunk | S11 green; `rg "maxRetries" server/adapters` shows only the explicit 0 |
| **S13** | Fake `scriptFailure(kind)` and `scriptStreamFailure(kind, {afterChunks})`; surface `kind` in error bodies and `StreamErrorEvent`; `AuthFailed` opens the missing-key dialog | Phase 6 journey h parameterized over AuthFailed, RateLimited, and ContentRefused |
| **S14** | ADR drafts in this document; `server/migrations/README.md`; PR body | Every gate below evidenced |

**Parallel:** {S1 to S5} alongside {S11 to S13}. **Sequential:** S5 then S6 to S10 (B's boot hook sits beside A's). S14 last.

---

## ADR drafts (become 0007 and 0008 in Phase 4)

**ADR 0007 — Versioned on-disk library with forward-only migrations.**
*Context:* the library is YAML on the filesystem; its shape is implied by whichever Zod `.default()` is in the running build; an older library meeting a newer schema fails at read with no diagnosis. *Decision:* `schemaVersion` on `meta.yml` (per book) and `learning-profile.yml` (global), absent meaning 1; ordered pure forward-only steps; a `LibraryMigrator` port run eagerly in `startServer` before crash recovery; `buildServer` stays mutation-free; committed fixture libraries at old versions are the test corpus. *Consequences:* migration is one auditable pass with a log line, not scattered read-time coercion; schemas can stop leaning on read-time defaults; there is no backward migration, so a downgrade fails loudly instead of corrupting; a book added while the app runs waits for the next boot. *Revisit when:* the library outgrows the filesystem, or a migration ever needs to be reversible.

**ADR 0008 — Persisted job journal with disk-truth resume.**
*Context:* background tasks and the chapter-generation hub are in-memory; a restart strands long jobs, and crash recovery can only reset statuses. *Decision:* one YAML file per job under `{dataDir}/jobs/`, written with the same temp-then-rename helper; a `JobJournal` port composed onto `BackgroundTasks` by a decorator adapter rather than making the existing port async; auto-resume only for `generate-all` and `generate-audiobook`, everything else marked cleanly retriable; resume recomputes its start point from disk and treats the checkpoint as advisory. *Consequences:* no mid-stream token resume is possible with any provider API, so the semantics are restart-the-step; already-saved chapters and narrated audio are never regenerated; the existing contract test proves the decorator is transparent; two processes on one data dir cannot corrupt a shared journal. *Revisit when:* a job type appears whose steps are not idempotent from disk, or auto-resume is observed spending money the user did not intend.

---

## Sanctioned behavior changes (PR body)

1. Startup migrates the library forward and stamps `schemaVersion`; the first boot after upgrade rewrites `meta.yml` and `learning-profile.yml`.
2. Reading a library written by a newer build now fails loudly (`SchemaTooNewError`) instead of silently coercing.
3. Interrupted `generate-all` and `generate-audiobook` jobs resume automatically at boot; opt out with `TUTOR_NO_AUTO_RESUME=1`.
4. Interrupted epub, cover, and audiobook-install jobs appear in the existing tray as errored and retriable instead of vanishing.
5. An interrupted chapter generation now surfaces in the reader's existing generation-error panel; `GET /api/books/:id` gains `generation.error`.
6. AI failures carry a `kind` in error bodies and SSE error events; retry is now classed (AuthFailed and ContentRefused never retry), and `AuthFailed` opens the existing missing-key dialog.
7. AI SDK internal retries are disabled (`maxRetries: 0`); the adapter owns retry, so total provider calls per failure drop.

---

## Risks

1. **Migration correctness on a real library** is the highest. Mitigation: fixtures are copies of real book folders, the migrator is idempotent and re-run in the test, and it never deletes. It also writes a one-time backup of `meta.yml` to `meta.yml.bak-v1` on first migration; that costs bytes and turns a bad migration from data loss into a manual restore.
2. **Resume idempotency** is mitigated by disk-is-truth; the S8 test asserting no chapter below `generatedUpTo` is regenerated is the gate.
3. **Retry runaway** is mitigated by SDK `maxRetries: 0` plus attempt caps, a total-elapsed ceiling, and full jitter; the pure policy test asserts the worst-case total delay.
4. **Stream retry duplicating visible text** is mitigated by retrying only before the first emit; a contract test scripts a failure after chunk one and asserts no duplication.
5. **`.gitignore` swallowing fixtures** is confirmed live; S1 fixes and verifies it before anything depends on it.
6. **Boot-order coupling** between migrate, recover, and resume is handled by one ordered block in `startServer` with a comment stating why, and a test that asserts the order.
7. **Phase 6 overlap.** S10 and S13 touch assertions Phase 6 owns, so both are deferred until Phase 6 merges and this branch rebases.

## Phase gate

`pnpm test` green (at least the Phase 6 count plus the new contract, migration, resume, and taxonomy tests), `pnpm typecheck` clean, `pnpm lint` zero warnings, the full Phase 6 E2E suite green including journey h per error class, fixture libraries migrate forward and the migrator is idempotent on re-run, manual kill of the app mid-`generate-all` and mid-audiobook followed by a restart verifies resume with zero regeneration, `buildServer()` performs no writes (read-only-temp-dir assertion), `rg "maxRetries" server/adapters` yields only the explicit `0`, and three Electron modes boot.

### Critical files for implementation
- server/composition-root.ts
- server/index.ts
- server/adapters/ai-sdk-text-generation.ts
- server/adapters/in-memory-background-tasks.ts
- shared/domain.ts
