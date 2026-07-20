# Phase 0 — Safety Net + Hygiene

## Objective

Make the repo mechanically verifiable before any code moves: characterization tests over the routes that currently have 0% coverage, CI that fails on warnings, hooks that mirror CI, and a pruned repo surface. One production code change is allowed (`buildServer()` extraction) because route tests cannot exist without it. Everything else is tests, config, and deletions.

## Verified baseline (re-checked against the repo, not the digest)

- `pnpm test` → 33 files, 384 tests, 2.43s, green. `npx tsc --noEmit` → exit 0, 2.7s wall. `pnpm lint` → 14 warnings, 0 errors (exact list in S4).
- `server/index.ts` exports only `startServer(port, host)`, which calls `recoverFromCrash()` then `fastify.listen()`. No injectable factory → S1 is required.
- Filesystem seam already exists: `lib/data-dir.ts:getDataDir()` honours `process.env.TUTOR_DATA_DIR`. `book-store.ts` resolves it lazily per call; `key-store.ts` resolves it **at module load** (`const keysFile = join(getDataDir(), …)`), so env must be set before any import — a vitest `setupFiles` entry, not a `beforeEach`.
- AI seam: `server/services/model-client.ts:createModelClient()` throws `No API key configured for provider: X` before constructing any SDK client. With `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_API_KEY` unset and an empty temp data dir (no `api-keys.json`), **no AI route can reach the network**. `models.ts` returns 400 before `fetch` when no key.
- `docs/todos.yaml` is **0 bytes**, tracked since the initial commit. There is nothing to convert to issues — see S10.
- Tracked `.DS_Store`: `.DS_Store`, `docs/.DS_Store`, `talks/.DS_Store`, `talks/ai-harness/.DS_Store`. `.gitignore` has no `.DS_Store` entry.
- `talks/` is 47MB, and `package.json` scripts `dev.talk`/`build.talk` plus devDep `@marp-team/marp-cli` exist only to serve it. No `.github/` dir. Remote is `git@github.com:rsml/tutor.git`, `gh` authed as `rsml`.

---

## Tasks

### S1 — Extract `buildServer()` (only production change)

**File:** `server/index.ts`
**Spec:** Split `startServer` into `export async function buildServer(): Promise<FastifyInstance>` containing everything from `Fastify({...})` through `fastify.get('/api/health', …)` (CORS hook, `mermaidRenderer` decoration, rateLimit, all nine route registrations, `setErrorHandler`, health route) and return the instance without listening. `startServer(port = 3147, host = '127.0.0.1')` becomes: `const fastify = await buildServer()` → `recoverFromCrash()` block unchanged → `await fastify.listen({ port, host })` → `return fastify`. Do not change the logger config, hook order, or `electron/main.ts`.
**Acceptance:** `rg "export async function buildServer" server/index.ts` hits; `rg "fastify.listen" server/index.ts` appears exactly once and only inside `startServer`; `npx tsc --noEmit` exit 0; `pnpm test` still 384/384.

### S2 — Test environment guard (data dir + no AI keys)

**Files:** new `server/test/setup-env.ts`; edit `vitest.config.ts`.
**Spec:** `setup-env.ts` (runs per test file, before that file's imports): `mkdtempSync(join(tmpdir(), 'tutor-test-'))`, assign to `process.env.TUTOR_DATA_DIR`, `delete process.env[k]` for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, and register `afterAll` cleanup with `rmSync(dir, { recursive: true, force: true })`. Add `setupFiles: ['./server/test/setup-env.ts']` to `vitest.config.ts`. Add a header comment stating the two invariants it enforces (no writes to the real data dir, no live AI calls).
**Acceptance:** `pnpm test` still 384/384 (existing `vi.mock('../../lib/data-dir.js')` tests are unaffected); `ANTHROPIC_API_KEY=fake pnpm test` also green, proving the key strip works.

### S3 — Characterization tests (four files + one harness)

**Files:** new `server/test/route-harness.ts`, `server/routes/books.characterization.test.ts`, `server/routes/ai-routes.characterization.test.ts`, `server/routes/audiobook.characterization.test.ts`, `server/routes/import.characterization.test.ts`.

**Harness spec:** export `createTestServer()` → `await buildServer()` (fresh instance per test file in `beforeEach`, `await app.close()` in `afterEach`; a fresh instance also resets the in-memory rate limiter). Export `seedBook(partial?)` writing a valid `meta.yml` + `toc.yml` + `chapters/01.md` through `server/services/book-store.js` (never raw `fs`), and `dataDir()` returning `process.env.TUTOR_DATA_DIR!`.

**Characterization discipline:** assert what the code *does today*, including quirks. Record status code plus the response shape (keys, not full prose). Do not fix anything you find; note it in the PR body.

`books.characterization.test.ts` — happy path via `app.inject`:

| Route | Cases |
|---|---|
| `GET /api/books` | empty → `[]`; one seeded → augmented keys `hasCover,showTitleOnCover,coverUpdatedAt,chaptersRead,hasAudiobook` |
| `GET /api/books/:id` | seeded → meta + `generation`; unknown id → **404 `{error:'Not found'}`** (ENOENT handler); `id` violating `^[a-z0-9-]{1,50}$` → 400 |
| `PATCH /api/books/:id` | title/tags update → `{ok:true}` and tags lowercased/hyphenated; bad body → 400 `{error:'Invalid request',details}` |
| `DELETE /api/books/:id` | → `{ok:true}`, then `GET` → 404 |
| `POST /api/books/:id/reset` | seeded `reading` → `{ok:true}`; status `generating` → 409 |
| `GET /api/books/:id/toc` | seeded → `{chapters:[…]}` |
| `PUT /api/books/:id/toc` | 2 chapters → `{ok:true}` and `totalChapters` becomes 2 |
| `GET /api/books/:id/chapters/:num` | seeded → `{content}`; num > totalChapters → 400 out-of-range; num `0`/`abc` → 400 (param pattern) |
| `GET /api/books/:id/generation-status` | idle book → current shape |
| `PUT /api/books/:id/progress/:num` | valid `ChapterProgressSchema` body → `{ok:true}`; invalid → 400 |
| `POST /api/books/:id/chapters/:num/feedback` | with a seeded quiz → `{ok:true}` and stored feedback has `quiz.score` computed from `quizAnswers`; without a quiz → `{ok:true}`, `questions: []` |
| `GET /api/books/:id/chapters/:num/quiz` | seeded quiz file → returns it verbatim (cached path, no AI) |
| `PUT /api/books/:id/rating` | rating 4 → `{ok:true}`; rating 0 → field deleted; `finalQuizScore` → status `complete` |

`ai-routes.characterization.test.ts` — validation/error paths only:
- `POST /api/books` with `{}` → 400 `{error:'Invalid request'}` (returns before `reply.raw.writeHead`).
- `POST /api/books` with a *valid* body → 200 SSE body whose last event is `type:'error'` with message `No API key configured for provider: anthropic`, and `GET /api/books` then shows one book with `status:'failed'`. This is the proof that no network call happens; keep it and comment it as such.
- `POST /api/books/:id/generate-next` `{}` → 400. `POST /api/books/:id/toc/revise` `{}` → 400. `POST /api/books/:id/final-quiz` `{}` → 400. `GET /api/providers/anthropic/models` → 400 `No API key configured for anthropic`.

`audiobook.characterization.test.ts` — `GET /api/audiobook/status` → `{installed:false, missing:{model,ffmpeg}, downloadSize}`; `GET /api/audiobook/voices` → non-empty array with `id,name,language,gender,grade`; `GET /api/audiobook/voices/zzz/preview` → 400 (param pattern) and `/api/audiobook/voices/am_michael/preview` → 409 `needsInstall:true`.

`import.characterization.test.ts` — `POST /api/books/import/preview` with `{}` → 400 `Invalid request`; with `{base64:'bm90YW56aXA='}` (valid base64, not an EPUB) → 400 with an `error` string.

**Acceptance:** `pnpm vitest run server/routes/*.characterization.test.ts` green with ≥35 tests; whole suite ≥419 tests; suite wall time < 15s; `rg "127.0.0.1|listen\(" server/routes/*.characterization.test.ts` returns nothing (inject only); run the suite twice consecutively to prove no cross-run state leaks.

### S4 — Zero-warning lint

**Files:** `server/routes/books.ts`, `src/components/ChapterBreakdownList.tsx`, `src/components/ReaderHeader.tsx`, `package.json`.
**Spec:** exactly these 14: `books.ts:173` `(err as any).statusCode` → `(err as Error & { statusCode?: number })`; `books.ts:1044` drop the unused `quizModel, quizProvider, quizLength` from the destructure (leave `CreateBookBodySchema` untouched); prefix the unused `reply` arg with `_` at `books.ts` lines 2059, 2088, 2100, 2122, 2141, 2165, 2193, 2230; `ChapterBreakdownList.tsx:14` `bookId` → `_bookId`; `ReaderHeader.tsx:12` `chatOpen` → `_chatOpen`. In `package.json`: `"lint": "eslint --max-warnings 0 src/ server/ electron/ lib/"`, same flag on `lint:fix`, and add `"typecheck": "tsc --noEmit"`.
**Acceptance:** `pnpm lint` exits 0 with no output beyond the pnpm banner; `pnpm typecheck` exits 0; `pnpm test` unchanged count.

### S5 — lefthook mirrors CI

**File:** `lefthook.yml`.
**Spec:** `pre-commit` (parallel): `lint` → `glob: "*.{ts,tsx}"`, `run: pnpm exec eslint --max-warnings 0 {staged_files}`; `typecheck` → `run: pnpm typecheck`. Add `pre-push` with `test: pnpm test`. Replace `npx` with `pnpm exec` throughout. Add a comment naming CI as the mirror source.
**Consolidation delta 8:** before writing, glob for any existing lefthook config (`lefthook.yml`, `.lefthook.yml`, `.config/lefthook.yml`, package.json `lefthook` key) — one recon source claims one exists running `npx tsc`. Create or amend accordingly.
**Acceptance:** `pnpm exec lefthook run pre-commit` exits 0; `pnpm exec lefthook run pre-push` exits 0.

### S6 — GitHub Actions CI

**File:** new `.github/workflows/ci.yml`.
**Spec:** name `CI`; triggers `push: [master]` and `pull_request`; single job `verify` on `ubuntu-latest` with `env: ELECTRON_SKIP_BINARY_DOWNLOAD: 1`; steps: `actions/checkout@v4` → `pnpm/action-setup@v4` (version comes from `packageManager: pnpm@10.30.1`) → `actions/setup-node@v4` with `node-version: 24` + `cache: pnpm` → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test`. Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
**Acceptance:** `gh workflow list` shows CI after push; the first run on the phase branch is green. If `pnpm install` or the kokoro/onnxruntime imports fail on Linux, first retry with `pnpm install --frozen-lockfile --ignore-scripts`; only if that also fails, switch `runs-on` to `macos-14` and say so in the PR body.

### S7 — `.DS_Store` purge

**Files:** `.gitignore` (add `.DS_Store`), index.
**Spec:** `git rm --cached .DS_Store docs/.DS_Store talks/.DS_Store talks/ai-harness/.DS_Store` then commit with the `.gitignore` change.
**Acceptance:** `git ls-files | grep -c DS_Store` → `0`; `git check-ignore -v .DS_Store` names `.gitignore`.

### S8 — Delete superseded docs

**Spec:** `git rm` these 12 (each describes a shipped feature — verified against live routes `/reset`, `/toc/revise`, `/final-quiz`, `/generate-all`, epub export + `mermaid-renderer.ts`, tags/series in `PATCH /api/books/:id`) plus the empty `docs/todos.yaml`:
`docs/plans/2026-03-06-keep-going-flow-design.md`, `2026-03-06-keep-going-flow.md`, `2026-03-07-book-completion-flow-design.md`, `2026-03-07-quiz-review-design.md`, `2026-03-07-quiz-review-plan.md`; `docs/superpowers/plans/2026-03-16-epub-mermaid-katex-rendering.md`, `2026-05-16-book-reset.md`, `2026-05-16-toc-revise-before-chapter-1.md`; `docs/superpowers/specs/2026-03-16-epub-mermaid-katex-rendering-design.md`, `2026-03-16-library-organization-design.md`, `2026-05-16-book-reset-design.md`, `2026-05-16-toc-revise-before-chapter-1-design.md`; `docs/todos.yaml`.
Keep `docs/screenshots/**` (referenced by README).
**Consolidation deltas 6+7:** additionally `git rm -r` `.superpowers/`, `.agents/`, `skills-lock.json`, and the stray `pnpm-workspace.yaml` (verify `pnpm install` still builds native deps after its removal). Commit `docs/plans/refactor/{master-plan,consolidation,phase-0}.md` in this phase.
**Acceptance:** `ls docs` → `plans screenshots`; `rg "docs/(plans|superpowers|todos)" README.md CLAUDE.md CONTRIBUTING.md` returns nothing.

### S9 — Move `talks/` out (owner approved during planning)

**Spec:** repo name `rsml/talks` (holds both decks). Owner approved the move and README link during the decision interview; log each outward step in the phase report.
1. `git subtree split --prefix=talks -b talks-export`
2. `gh repo create rsml/talks --public --description "Conference talk decks (Marp)"`
3. `git push git@github.com:rsml/talks.git talks-export:main`
4. `git rm -r talks && git branch -D talks-export`
5. `package.json`: delete the `dev.talk` and `build.talk` scripts and the `@marp-team/marp-cli` devDependency; run `pnpm install` to refresh the lockfile.
6. `README.md`: add a line under the intro, `Talks about this project live in [rsml/talks](https://github.com/rsml/talks).`

**Acceptance:** `git ls-files talks | wc -l` → 0; `rg "marp" package.json` returns nothing; `git diff --stat pnpm-lock.yaml` shows only marp-related removals; `pnpm test` and `pnpm typecheck` still green; repo size drops ~47MB.

### S10 — GitHub issues

**Finding:** `docs/todos.yaml` is empty, so there is nothing to convert verbatim. **Owner-approved substitute:** create six tracking issues from the phase plan so a cold GitHub visitor sees an organised backlog: `gh issue create --title "Phase N — <title>" --body "<phase objective + gate>"` for P0…P5, plus a `refactor` label. Do not invent product todos.
**Acceptance:** `gh issue list` shows the created issues.

---

## Risks

1. **CI native modules.** `kokoro-js` and `@huggingface/transformers` are statically imported by `audiobook.ts`/`books.ts`, so route tests load `onnxruntime-node` on Linux. Mitigation ladder in S6. This is the single most likely CI failure.
2. **Import-time data dir.** `key-store.ts` computes its path at module load. Any test that sets `TUTOR_DATA_DIR` in `beforeEach` instead of `setupFiles` silently writes to the real data dir. S2 is the guard, do not weaken it.
3. **SSE routes under `inject`.** Routes that call `reply.raw.writeHead` only resolve after `reply.raw.end()`. Only the paths that terminate (validation 400, the no-key error path) are safe to characterize. Never call `generate-next` or `start` with a valid body.
4. **Rate limits leak across tests.** `POST /api/books` is 5/min per instance. Build a fresh app per test file.
5. **`buildServer()` reordering.** Moving `recoverFromCrash` or the CORS hook changes Electron behaviour. S1 must preserve hook order exactly, and `electron/main.ts` keeps calling `startServer`.
6. **Characterization drift.** Tests that assert prose from AI prompts will be brittle. Assert status codes, keys, and stored file state only.
7. **Lockfile churn (S9).** If `pnpm install` touches unrelated entries, revert and drop only the scripts, deferring the devDependency removal to Phase 5.

---

## Phase gate checklist

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0, zero warnings
- [ ] `pnpm test` green, ≥419 tests, < 15s, and green again on a second consecutive run
- [ ] `ANTHROPIC_API_KEY=fake pnpm test` green (no live AI reachable)
- [ ] No test writes outside `os.tmpdir()`: `rg "getDataDir\(\)" server/**/*.test.ts` shows only harness use, real data dir mtime unchanged
- [ ] `pnpm exec lefthook run pre-commit` and `pre-push` exit 0
- [ ] CI green on the phase branch
- [ ] `git ls-files | grep -c DS_Store` → 0; `ls docs` → `plans screenshots`; `git ls-files talks | wc -l` → 0
- [ ] `pnpm electron:preview` boots and the library renders (manual, once, at phase end)
- [ ] Single PR `phase-0-safety-net`, conventional commits, PR body lists every behaviour quirk the characterization tests froze

**Parallelisation for implementers:** S1 → S2 → S3 is a chain (one agent). S4 → S5/S6 is a second chain. S7, S8, S9, S10 are independent (one agent, sequential commits). Run the three groups concurrently in separate worktrees. S3 and S4 both touch `books.ts`, so S4 must land before S3's final rebase or the agents must sync on that file.
