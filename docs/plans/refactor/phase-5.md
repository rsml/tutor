# Phase 5 — Final Sweep + Demo Readiness

> **ARCHITECT'S POST-FLIGHT CORRECTIONS (written mid-effort after Phases 0-3 landed; these override the assumptions below):**
> 1. The knip entry for the client is `client/app/main.tsx` (Phase 3 moved it under `client/app/`).
> 2. CI runs on **macos-14** since Phase 0, so knip and the drift job append to that workflow; the branch-protection item stands.
> 3. These follow-ups ledger items are Phase 5's (see follow-ups.md): #2 swap `client/api/profile.ts`'s local `ProfileResponse` to the shared one, #8 decide with the owner whether the stale untracked `.worktrees/`/`.claude/worktrees/` full-repo copies get deleted, #9 decide the never-emitted `stage` SSE event (server emit vs remove vs keep documented), #14 evaluate extracting `useLibraryDnd`/`useLibraryFilters` from the 1,190-line LibraryPage.tsx IF cheap and behavior-preserving (its size is a recorded, accepted plan exception — do not treat as a defect), #17 adopt `find-unnamed-buttons.mts` (staged next to this file, root-arg + non-zero-exit ready) as a committed `scripts/` check, optionally wired into CI.
> 4. Visual verification methodology for any S3/S6 checks: compare against a SAME-BUILD control capture, never raw master-vs-branch byte equality — the `NoiseOverlay` texture regenerates via `Math.random()` on every mount (library surfaces only; reader is exactly comparable). Match viewport geometry between captures or the diff measures the harness, not the app.
> 5. The main checkout hosted overlapping agents twice this effort; before S3's parallel review fan-out, confirm no prior phase's processes or dev servers survive (check ports 3147/3247 parentage before killing anything).
> 6. Phase 4 now ships a root `ARCHITECTURE.md` hub with the five-diagram suite. S6's README architecture section therefore shrinks to ONE overview diagram plus a prominent link to ARCHITECTURE.md, do not duplicate the suite. The "Start here" line under the badges points at ARCHITECTURE.md first.
> 7. Phases 6 (E2E journeys on fake adapters) and 7 (durability: schema versioning, persisted generation jobs, AI error taxonomy) run before Phases 4 and 5. Your knip entries, fresh-clone script, and sweep scope must include their additions (e2e/ suite, migration fixtures, jobs journal). The fresh-clone script gains a step running the E2E suite.

Closing phase. Runs after P0–P4 merge. Strictly subtractive plus docs; no behavior change.

Consolidation deltas that modify this plan: the S4 repo-surface deletions (`.superpowers/`, `.agents/`, `skills-lock.json`, `pnpm-workspace.yaml`, marp scripts) were moved into Phase 0 — S4 here reduces to verification greps plus anything P0 deferred; S5 appends the knip job to the existing CI file rather than creating one; S8's issue/PR audit covers the six phase-tracking issues P0 created.

## Recon deltas that shape this phase

- `TUTOR_DATA_DIR` env var already exists (`shared/node/data-dir.ts` post-P1) — fresh-clone verification can run fully isolated from the real library.
- Electron starts the server on port `0` (random) and exposes it via IPC, so a boot check must discover the port, not assume 3147.
- `mac.notarize: true` in `package.json` will make an unattended `electron:build` attempt notarization and fail without credentials — the smoke build needs explicit flags.
- `docs/screenshots/{progress,reader}.png` are unreferenced by the README — verify and prune or reference.
- `scripts/ralph.sh` — review with the owner's intent in mind; likely prune.

## Implementer tasks

**S1 — Install the dead-code gate.** Add `knip` as devDependency (mature choice; `ts-prune` is archived and its author points to knip), with `knip.json` declaring entries: `server/index.ts`, `server/mcp-server.ts`, `electron/main.ts`, `electron/preload.ts`, `client/main.tsx` (post-P3: `client/app/main.tsx`), `scripts/*.ts`, `**/*.test.ts`. Add `"knip": "knip"` script.
*Accept:* `pnpm knip` runs; its raw report is captured verbatim into the phase PR body as the sweep worklist.

**S2 — Execute the knip worklist.** Delete unused files, exports, exported types, dependencies, and devDependencies it reports. Anything kept deliberately (public API of a port, fake used only in tests) goes in `knip.json` `ignore*` with a one-line comment saying why. Never delete on knip's word alone — grep the identifier across the repo first (dynamic imports are exactly what knip misses: `epub-gen-memory`, `sanitize-mermaid`, `mermaid-theme` are all dynamically imported), and run the fresh-clone script after S2, not just unit tests.
*Accept:* `pnpm knip` exits 0. `pnpm test` green, `tsc --noEmit` clean, `eslint` 0 warnings.

**S3 — Manual simplification sweep (parallel review agents, one per area: `shared/`, `server/ports+adapters`, `server/services+routes`, `client/features`, `client/api+store`, root config).** Each agent runs this checklist against `git diff master...HEAD` (the whole refactor) and reports findings only, no edits:
1. Duplicate helpers that survived the move — grep for the known offenders (`buildProfileContext`, the six label arrays, `AI_TIMEOUT_MS`, the Zod error block, raw status literals) and for any function body appearing in two files.
2. Orphaned files — modules with zero importers that knip missed (dynamic imports, string-path loads).
3. Barrel/`index.ts` files that only re-export one thing.
4. **Over-abstraction introduced by the refactor**: a port is suspect if it has exactly one adapter *and* no fake *and* no contract test *and* is called from one place — that is indirection, not a seam. Also flag: wrapper functions that only forward arguments, interfaces with a single implementation and no test double, service layers that only call one repository method, config objects with one field.
5. Comments and JSDoc restating signatures, or describing the pre-refactor structure.
6. Stale references to old paths (`@src/`, `src/`, `lib/`, `server/schemas.ts`, `prompts/*.md`) in code, configs, scripts, docs.
*Accept:* findings consolidated into one list; each item either fixed or answered with a reason in the PR body. No finding silently dropped. Over-abstraction cuts are capped: only remove if under ~50 lines and fully covered by existing tests; otherwise file an issue.

**S4 — Repo surface verification.** Verify P0's deletions held: `git ls-files | grep -E '\.DS_Store|^\.superpowers|^\.agents|^talks/|skills-lock|pnpm-workspace'` returns nothing. Prune unreferenced screenshots; review `scripts/ralph.sh`. Confirm `lint` script globs are `client/ server/ shared/ electron/`.
*Accept:* greps clean; fresh `pnpm install` emits no "ignored build scripts" prompt.

**S5 — CI + badges.** Append a `knip` step to the existing `.github/workflows/ci.yml`. Confirm the full job list: install, typecheck, lint, test, docs:routes drift, knip. Add branch protection on `master` requiring the CI check.
*Accept:* CI green on the phase PR; deliberately editing the routes doc fails the drift job.

**S6 — README polish.** Insert an Architecture section after Features: one inline mermaid diagram (GitHub renders natively) showing `client feature slices → typed api client → thin routes → services → ports → adapters`, ~10 nodes max, package granularity so it only changes when the top-level shape changes. Link out to `docs/adr/`, `CONTEXT.md`, the generated routes doc, and the talks repo. Add three badges at top: CI status, license, latest release. Refresh the Tech Stack table and the Development block against the new script names and folder layout. Verify every screenshot against the running app.
*Accept:* mermaid renders on GitHub (verify on the PR preview); every relative link resolves; no path named in README is absent from the tree.

**S7 — Fresh-clone verification script.** Commit `scripts/verify-fresh-clone.sh`, `set -euo pipefail`, steps in order:
1. `git clone --depth 1 file://$PWD "$TMP/tutor"` (catches "works only because of untracked files").
2. `pnpm install --frozen-lockfile`.
3. `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint --max-warnings 0`, `pnpm knip`.
4. Server boot: `TUTOR_DATA_DIR="$TMP/data" pnpm dev:server &`, poll `http://127.0.0.1:3147/api/health` for ok with a 30s timeout, kill.
5. `pnpm build`, then Electron boot: launch `electron . --remote-debugging-port=9222` with `TUTOR_DATA_DIR="$TMP/data"`, poll `http://127.0.0.1:9222/json` until a target exists, assert its URL is the built `index.html`, then kill. (Do not assume port 3147 here — the embedded server uses a random port.)
6. Build smoke: `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm electron:build --config.mac.notarize=false --publish never`, assert a DMG appears in `release/`.
7. `rm -rf "$TMP"` in a trap.
*Accept:* script exits 0 from a clean checkout on a machine with no `.env`; total runtime recorded in the PR body (expect 8–15 minutes; budget one clean run plus one re-run).

**S8 — Final git/GitHub state.** Confirm PR sequence P0→P1→(P2,P3)→P4→P5 all merged in order with conventional-commit titles and gate evidence in each body. Delete merged local and remote branches (~15 stale ones predate the refactor). Update repo description to lead with the engineering story. Add topics: `hexagonal-architecture`, `ports-and-adapters`, `typescript`, `electron`, `claude-code`. Set the About website. Add a "Start here" line directly under the badges pointing at Architecture, ADRs, CONTEXT.md. Close the six phase-tracking issues with a comment linking each phase PR.
*Accept:* `gh repo view` shows the new description/topics; `git branch -a` shows only active branches; the GitHub landing view shows badges, Start-here, screenshot, architecture diagram within one scroll.

**S9 — Demo runbook.** Author outside the repo, deliver as a file to the owner, never committed. Outline below.

## Runbook outline (10 minutes, three acts)

**Act 1 — Cold reader tour on GitHub (2:30).** Landing README → badges (CI green) → screenshot → architecture mermaid → click into `docs/adr/0001-filesystem-as-database.md` → `CONTEXT.md` glossary showing the Skill collision resolved → generated routes doc.
Talking points: "the routes doc cannot go stale, CI regenerates it and fails on drift"; "every non-obvious decision has an ADR, so the next agent inherits the reasoning, not just the result"; "the README diagram is the same shape as the folder tree."

**Act 2 — Narrated architecture tour in the editor (4:00).** `server/ports/` → open `text-generation.ts` (the shape) → `adapters/ai-sdk-text-generation.ts` (the only file that imports the AI SDK) → the fake → the contract test that both must pass → a service unit-tested against the fake → a route that is six lines. Then flip to `client/features/reader/` and the one typed API client, showing shared contract types imported by both sides.
Talking points: "the fakes exist because the ports do — I did not write mocks, I wrote a second adapter"; "the contract test is the port's definition of done, so swapping providers is a file, not a project"; "routes parse and delegate, that is the whole job"; "import boundaries are lint-enforced, so the architecture cannot rot quietly"; "the commit history shows the tests landing first — TDD you can audit."

**Act 3 — Live AI session (3:30).** Run the `verify` skill cold (test + typecheck + lint + boot, all green on screen). Then the `add-feature` skill: add one tiny capability live, watching it walk the test-first recipe — contract test red, adapter green, service test red, service green, route, client call. Show `CLAUDE.md` and `CONTEXT.md` open beside it and point out where the agent is getting each constraint.
Talking points: "the structure is the prompt — I am not explaining the codebase to it, it is reading the architecture"; "the same checklist a reviewer runs is the one the agent runs"; "watch the red-green rhythm — the skill enforces TDD, not my discipline in the moment."
Close with the fresh-clone script running in a spare terminal from the start, finishing green on camera.

**Prep block (do the day before):** throwaway `TUTOR_DATA_DIR` seeded with two finished books and one mid-generation; API keys loaded; caches warm so `pnpm install` is not on camera; a rehearsed fallback for the live AI step (a pre-recorded terminal capture) in case the model stalls.

## Risks

1. **Notarization blocks the build smoke.** Unattended `electron:build` will try to notarize and hang or fail. Mitigated by the explicit flags in S7 step 6; the signed path stays `scripts/release.sh`.
2. **Knip false positives cause over-deletion.** Dynamic imports are exactly what knip misses. Rule: grep first, fresh-clone script after S2.
3. **Over-abstraction cuts reopen P2.** Cap at ~50 lines and full test coverage; otherwise file an issue.
4. **Mermaid drift.** Keep the diagram at package granularity.
5. **Screenshots predate the refactor.** Behavior-preserving means they should still be accurate; verify each against the running app.
6. **Timing.** The full fresh-clone script including `electron:build` is likely 8–15 minutes.

## Final gate checklist

- [ ] `pnpm test` green; `tsc --noEmit` clean; `eslint --max-warnings 0`; `pnpm knip` exits 0
- [ ] `scripts/verify-fresh-clone.sh` exits 0 end to end, including the DMG smoke
- [ ] CI green on `master`; routes-doc drift job proven to fail when the doc is edited
- [ ] Every S3 finding either fixed or answered in writing
- [ ] No tracked `.DS_Store`, `.superpowers/`, `.agents/`, `skills-lock.json`, `talks/`
- [ ] README: badges render, mermaid renders, all relative links resolve, screenshots match the running app
- [ ] `gh repo view` shows updated description, topics, and website
- [ ] Merged branches pruned locally and on the remote; six phase issues closed with PR links
- [ ] Demo runbook delivered to the owner as a file, not committed
- [ ] Full 10-minute runbook rehearsed once end to end with the seeded data dir
