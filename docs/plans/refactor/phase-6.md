# Phase 6 — Committed E2E Journey Suite on Fake Adapters

> **PARALLEL-EXECUTION ADDENDUM (architect, owner-approved):** Phase 7 develops CONCURRENTLY with this phase, in the main checkout, while Phase 6 runs in its own worktree off post-P2 master. Phase 6 MERGES FIRST. Consequences: land S1 (walking skeleton) and push it as early as possible and message the architect when it is on the branch, Phase 7 wants it for local verification. Journey (h)'s per-error-class variants may be added by Phase 7's lead as its final integration task after this phase merges, so build journey (h) with a parameterizable failure-injection point. Do not touch server/ or shared/ source (Phase 7 owns them this window); if a journey needs a server change, report it, do not make it.

## Objective

Prove the whole app works end to end, deterministically, with zero live-provider traffic and zero API keys, by driving the real browser UI against the real Fastify server whose edges are fakes. Pure test addition. No production file changes except config lines and two devDependencies. The suite is the regression net Phase 7's durability work will lean on, and the thing a cold reader opens to see that the hexagon is not decoration.

## 0. Reconciled during execution

Facts found in the code that contradict what this plan was written against. The plan below is corrected in place, and this list records what moved and why, so the difference between plan and reality is never silent.

1. **The Phase 2 precondition is clean on master.** `rg -l "model-client" server --glob '!server/adapters/**' --glob '!**/*.test.ts'` returns nothing at `e8a5dd1`. Phase 2 finished the job. No journey is blocked, so (a), (b), and (f) are all in scope.
2. **`server/services/key-store.ts` no longer exists.** The plan's harness section warns that it builds its vault at module load, which forces `TUTOR_DATA_DIR` to be set before the first server import. Phase 2 replaced it with `createFileKeyVault({ dataDir })`, constructed inside `createPorts` from a `getDataDir()` call that reads the environment every time. The env var is still set before the dynamic import, because the guarantee costs nothing and `server/test/setup-env.ts` documents the same reasoning, but the constraint is now belt and braces rather than load bearing.
3. **The config surface is four lines, not three.** `pnpm lint` globs `client/ server/ electron/ shared/` explicitly, so an ESLint boundary block for `e2e/` would never run without adding `e2e/` to that script. The four touches are the vitest `exclude`, the tsconfig `include`, the ESLint boundary block, and the lint script glob. The phase gate's real invariant, that `git diff --stat master -- client/ server/ shared/ electron/` shows nothing, is unaffected, and it is the invariant this phase holds to.
4. **The scripted adapter must satisfy `FakeTextGeneration`, not bare `TextGeneration`.** `describeTextGenerationContract` types its `makeSubject` as `() => FakeTextGeneration`, because two of the behaviours it pins are only observable through the fake's scripting and recording surface. So the scripted adapter keeps the FIFO `scriptStreamText` / `scriptGenerateObject` / `scriptToolConversation` methods and the `requests` record, and adds intent rules underneath them. A queued script wins, rules answer when the queue is empty, and an unmatched call throws. That ordering is what lets one object satisfy the contract suite and the journeys at once.
5. **The renamed data directory guard.** Per-test isolation is a fresh `buildServer()` plus a fresh books directory, and the fixture removes `${dataDir}/books` on teardown rather than the whole worker directory, because the worker directory also holds the key vault file the real adapter would write to if anything ever asked it to.

## Precondition on Phase 2 (hard gate, verified before starting)

The harness premise is that overriding `textGeneration` makes generation deterministic. Verified empty at `e8a5dd1`:

```
rg -l "model-client" server --glob '!server/adapters/**' --glob '!**/*.test.ts'
```

## Runner decision: `@playwright/test`, standalone, `e2e/` top level

Recommended over extending Phase 3's hand-rolled CDP harness, and over vitest browser mode.

- **Maturity.** Playwright is the boring industry default. Phase 3's CDP harness was correct for what it did, a one-off pixel measurement where a screenshot and a byte compare were the whole job. A committed journey suite needs auto-waiting locators, per-test isolation, traces, and reporting, and hand-rolling those is precisely the clever-over-simple trap the owner's principles reject.
- **Deterministic waits come free.** Web-first assertions such as `await expect(locator).toContainText(...)` retry to a deadline. That is the answer to SSE timing flake, and it is why no journey contains a sleep.
- **One tool covers Electron.** `_electron.launch()` gives journey (g) without a second harness. That single fact decides it, because the alternative is CDP-attaching to Electron by hand.
- **Vitest browser mode is rejected** as the newest, least battle-tested option, and mixing it into `pnpm test` would put a 90-second suite behind the 2.5-second unit run. `pnpm test` stays fast and E2E is `pnpm e2e`.

Cost is honest. One devDependency, one Chromium download in CI which is cached, and a second test runner in the repo. Two Playwright projects, `web` for chromium and all journeys, and `electron` for one smoke.

## Harness design

Server boots in-process inside a Playwright fixture, using the real `buildServer` from `server/index.ts`, so the fake objects stay addressable from the test and can be scripted and asserted mid-journey.

```ts
// e2e/support/app.ts  (worker-scoped dataDir, test-scoped server)
process.env.TUTOR_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'tutor-e2e-'))
const { buildServer } = await import('@server/index.js')   // AFTER the env var

const model = createScriptedTextGeneration()
const app = await buildServer({
  textGeneration: model,
  keyVault: createFakeKeyVault({ anthropic: 'e2e-key' }),
  speechSynthesis: createFakeSpeechSynthesis(),
  audioAssembly: createFakeAudioAssembly(),
  imageGeneration: createFakeImageGeneration(),
})
await app.register(fastifyStatic, { root: distDir })       // test-only, serves dist/
await app.listen({ port: 0, host: '127.0.0.1' })
```

Why this shape:

- **`buildServer(overrides)` is Phase 2's real signature** at `server/index.ts:61`, the same one `server/test/route-harness.ts` uses. `startServer` cannot be used because Fastify forbids registering the static plugin after `listen()`. The harness calls `recoverFromCrash()` itself if a journey needs boot parity.
- **Single origin.** In web mode `client/api/http.ts` resolves `_base = ''` and issues relative `/api/...` paths, because `window.electronAPI` is absent. Serving `dist/` from the same instance means no proxy, no CORS, and no `electronAPI` stub. `@fastify/static` is a first-party plugin and a new devDependency, and it replaces the hand-rolled static server Phase 3 used. No SPA fallback is needed because the client routes on view state rather than on URLs.
- **Data isolation.** `TUTOR_DATA_DIR` is worker-scoped and set once, before the first dynamic import of any server module. Per-test isolation comes from a fresh `buildServer()` plus a fresh books directory per test.
- **Zero live traffic is structural, not a promise.** No provider key exists on the real vault, the fake vault is in-memory, and any un-scripted model call throws by construction.

**Scripted model adapter** (`e2e/support/scripted-text-generation.ts`) implements `FakeTextGeneration` and answers by intent rather than by call order. Rules match on request shape, meaning `schemaName` or a substring of the prompt, and return fixture content while recording every request. Phase 2's FIFO `createFakeTextGeneration` stays untouched for unit and contract tests. A journey makes N calls in an order the UI decides, and coupling fixtures to that order is the single largest flake source. Fidelity is enforced two ways, by `req.schema.parse(value)` before returning so a drifted fixture fails loudly exactly as a malformed model response would, and by running the adapter against Phase 2's own `text-generation.contract.ts` suite in vitest.

**Fixtures** (`e2e/fixtures/`) are TS modules rather than JSON, so `tsc` catches schema drift. Plus `sample-book.epub`, a small binary generated once by a committed script using the same `epub-gen-memory` the export adapter uses, and `redux-state.json` for the Electron experiment.

**Journey helpers** (`e2e/support/journeys/*.ts`) are thin page objects exposing intent, such as `wizard.createBook({topic})` and `reader.finishChapter()`. Locators are role- and text-based and never CSS. Phase 3 gave every icon-only button an accessible name, which makes this possible and makes the suite double as an accessibility net. No `data-testid` is added to production components. If one journey genuinely cannot address an element, that is a finding to report rather than a silent client edit.

## Journeys and acceptance checks

| # | Journey | Acceptance |
|---|---|---|
| a | Create to TOC streams to edit/approve to chapter 1 streams to read | Wizard accepts topic, `toc` events render chapter titles from the fixture, editing a title persists to `toc.yml`, approve triggers `/start`, chapter 1 prose appears in the reader, `books/{id}/meta.yml` shows `generatedUpTo: 1` |
| b | Read to quiz to submit to feedback to next chapter | Quiz renders the fixture questions, a wrong answer records in the feedback record, submitting feedback triggers generation, chapter 2 text renders, and the scripted adapter's recorded chapter-2 prompt contains the feedback text, which proves the adaptive loop rather than just the plumbing |
| c | EPUB import preview to confirm | `setInputFiles` with `sample-book.epub`, preview dialog shows the fixture title and chapter count, confirm returns to the library with the book present |
| d | EPUB export | Export from the library, background task reaches done, `waitForEvent('download')` yields a non-empty `.epub`, and the file exists under the temp data dir |
| e | Library CRUD and search | Rename persists across reload, tag add shows in the filter surface, search by title filters the grid, delete removes the book from disk |
| f | Audiobook install gate | With an empty data dir, status shows not-installed and the gate appears, and the install button is never clicked because it downloads roughly 90MB from evermeet.cx. A second test seeds the binary and model directory in the temp dir, then generates chapter audio through the fake synthesis and asserts the player appears |
| g | Electron rehydration smoke (`@electron`) | Two runs, same seeded library, differing only in `redux-state.json`. Seeded position opens the reader at the seeded chapter, removed falls back to the server-derived position. Fixture-seeded and generation-free by construction, since fakes cannot be injected into the packaged main process |
| h | Failure journey | Scripted adapter raises with a distinctive message on the chapter stream, and the UI surfaces that message rather than a generic fallback. The injection point is parameterized so Phase 7 can add per-error-class variants |

## Implementer tasks

- **S1 — Walking skeleton.** The `e2e/` scaffold, `playwright.config.ts`, the `app.ts` fixture, the scripted adapter, `pnpm e2e`, plus one journey that creates a book and asserts the fixture TOC titles render. Proves static serving, api-base resolution, SSE, the scripted model, and the temp data dir. Also the vitest `exclude: ['e2e/**']` because the default include collects `*.spec.ts` and would otherwise break `pnpm test`, the tsconfig `include`, the ESLint boundary allowing `e2e` to reach `@server` and `@shared` while forbidding `e2e` to reach `@client`, and the lint script glob.
- **S2 — Contract-test the scripted adapter** against `server/ports/text-generation.contract.ts` in vitest. Lands with S1 or immediately after, and this is the fidelity guarantee.
- **S3** — journey (a) completed through approve to chapter 1 to read.
- **S4** — journey (b), including the prompt-contains-feedback assertion.
- **S5** — fixture builder script and committed `sample-book.epub`, plus journey (c).
- **S6** — journey (d).
- **S7** — journey (e).
- **S8** — journey (f), both halves.
- **S9** — journey (h).
- **S10** — Electron project and journey (g), CI jobs, and `e2e/README.md` covering how to run, how to add a journey, why fakes, and why no testids.

One commit per task, `test(e2e): ...`. S3 to S9 are independent once S1 lands and can fan out across worktrees.

## CI integration

Append to the existing `.github/workflows/ci.yml` rather than creating a file, per consolidation delta 5.

- **`e2e-web`** runs on macos-14 with node 24, keeps `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`, caches `~/Library/Caches/ms-playwright`, runs `pnpm exec playwright install chromium`, `pnpm build`, and `pnpm e2e --project=web`, and uploads `playwright-report/` on failure.
- **`e2e-electron`** is the same but without `ELECTRON_SKIP_BINARY_DOWNLOAD`, because the binary is required. It caches `~/Library/Caches/electron` and runs `pnpm e2e --project=electron`.

Both run in parallel with `verify`. Budget is roughly 30s for the build, 60 to 90s for the web suite, and 30s for electron, all inside the 3 to 4 minute target. Flake policy is `retries: 0`, `trace: 'retain-on-failure'`, and `workers: 2`. With in-process fakes and no network there is no legitimate source of nondeterminism, so a retry would hide a real bug. A journey that flakes twice gets quarantined with `test.fixme` plus an issue, never a blanket retry.

## Risks

1. **Fake-adapter fidelity drift** is the highest. Fixtures could satisfy the tests while diverging from what a real model returns. Mitigated by `schema.parse` on every scripted object, by running Phase 2's contract suite against the scripted adapter in S2, and by fixtures being TS modules typed against the real schemas. Residual risk stays on prompt content, which no fake can cover, and the manual pass in the Phase 2 and Phase 7 gates remains the backstop.
2. **Playwright resolving the server's TS.** Server modules import with `.js` specifiers and `@server` and `@shared` aliases. Playwright's loader handles tsconfig `paths` and extension substitution, but that is unverified here and is S1's first checkpoint. The fallback if it fails is to boot the server in a `tsx` child process and drive the scripted adapter through a test-only control route, which has more moving parts, so it is only used if forced.
3. **Electron in CI.** A GUI app on a hosted macOS runner, plus a large binary download. Isolated in its own job and tagged `@electron` so it can be excluded with one flag without touching the web suite.
4. **SSE timing.** Handled by auto-retrying assertions and zero-delay scripted chunks. The adapter takes an optional `chunkDelayMs` for the one or two journeys where streaming render order matters.
5. **Audiobook install gate touching the network.** Structural, because the install button is never clicked and the journey asserts the gate rather than the install.
6. **Suite runtime creep** as journeys accrete. The gate below pins a number.

## Phase gate

- `pnpm e2e` green twice consecutively, locally and in CI, with `retries: 0`.
- Web suite under 120s wall clock, and both e2e jobs under 4 minutes each.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` unchanged and green, with E2E excluded from vitest and included in tsc and ESLint.
- **Mutation evidence.** With one deliberate break, the suite fails and names the journey, recorded in the PR body. A test suite that has never failed is not yet evidence.
- Zero production source files changed. `git diff --stat master -- client/ server/ shared/ electron/` shows nothing.
- Zero outbound provider traffic. No key exists in either vault, and the scripted adapter has no SDK import.

### Critical Files for Implementation

- `server/index.ts` holds `buildServer(overrides)`, the exact boot mechanism the harness calls
- `server/composition-root.ts` holds the `Ports` interface and the override semantics
- `server/ports/text-generation.ts` and its `.fake.ts` and `.contract.ts` siblings define the shape the scripted adapter implements and is contract-tested against
- `client/api/http.ts` explains why single-origin static serving works in web mode
- `.github/workflows/ci.yml` is the file the two E2E jobs append to
