# Phase 1 — Monorepo Shape

## Objective

Turn a flat `src/ + server/ + lib/` tree into four named zones — `client/`, `server/`, `shared/`, `electron/` — with `@client/* @server/* @shared/*` aliases wired through every build entry point and ESLint enforcing the dependency direction. Zero behavior change. The phase succeeds only if all three Electron modes still run and the packaged bundle's external-dependency set is byte-identical to the baseline.

## Recon corrections (verified against the repo, not the record)

1. **`@server/*` alias exists but is used zero times.** `@src/` is used 260 times across 67 client files. So the client move is the only large rewrite.
2. **`server/schemas.ts` is 100% shareable.** Every one of its 378 lines is pure Zod. The "server-only" bucket is empty: the entity schemas are what the UI renders, and every `*BodySchema` is by definition the HTTP contract the client posts. Genuinely server-only schemas are the inline `z.object()`s inside `routes/books.ts` used for `generateObject()` — those stay put (P2 moves them next to the ports). Only 11 import lines reference `../schemas.js`.
3. **`lib/` is two unrelated things.** `data-dir.ts` is Node-only (`node:os`, `process.env`, `process.platform`), used by 4 server files + `electron/main.ts`. `mermaid-theme.ts` is browser-safe (imports `culori`), used by `client/components/MermaidDiagram.tsx` + `electron/main.ts`.
4. **There is an existing boundary violation:** `electron/main.ts:382` does `await import('../src/lib/sanitize-mermaid.js')` — main process reaching into renderer code. The move fixes it by relocating the module to `shared/`.
5. **The Electron main bundle does not inherit `vite.config.ts`.** `vite-plugin-electron` calls `mergeConfig(defaultConfig, options.vite)` with `configFile: false` (`node_modules/vite-plugin-electron/dist/index.js:33-63`). Root `resolve.alias` is invisible to it. Today that is harmless because `electron/main.ts` reaches `server/` and `lib/` through relative paths, and `external()` returns `false` for anything starting with `.` — which is precisely why `server/**` gets bundled into `dist-electron/main.js` (confirmed: chunks `sanitize-mermaid-*.js`, `mermaid-theme-*.js`, `markdown-html-*.js` exist).
   **Therefore: the moment any file in the Electron bundle graph (`electron/**`, `server/**`, `shared/**`) uses `@shared/…`, `external()` returns `true`, the specifier survives into `dist-electron/main.js`, and the packaged app dies with `Cannot find package '@shared'`. `electron:dev` will not catch it. This is the phase's single biggest failure mode.**
6. No `import.meta.url`/`__dirname` directory-depth math in `server/` or `lib/`; no `@source` globs in `src/index.css`; electron-builder `files` globs reference only `dist/**` and `dist-electron/**`. Those three are non-issues.
7. `scripts/diagnose-quiz.ts` imports `../server/services/...` relatively. `lefthook.yml` runs `npx tsc --noEmit`; there is no `pnpm typecheck` script. (Consolidation delta 8: verify which lefthook state P0 actually found and left behind.)

## Move map

| From | To | Notes |
|---|---|---|
| `src/**` (all 12 entries) | `client/**` | one `git mv src client` |
| `src/lib/sanitize-mermaid.ts` + `.test.ts` | `shared/sanitize-mermaid.ts` + `.test.ts` | after the client move; kills the electron→renderer import |
| `lib/mermaid-theme.ts` + `.test.ts` | `shared/mermaid-theme.ts` + `.test.ts` | |
| `lib/data-dir.ts` | `shared/node/data-dir.ts` | `shared/node/` = Node-only shared code, banned from `client/**` by lint |
| `server/schemas.ts` | `shared/domain.ts` + `shared/contracts.ts` | domain = lines 1–184 (entities); contracts = 186–378 (`Provider`, `Model`, `*BodySchema`, `ImportEpubPreviewResponseSchema`) |
| — (new) | `shared/book-status.ts` | `BookStatus` union + `isGenerating/isReadable/isAwaitingTocApproval/isComplete/isFailed`; re-exported by `domain.ts` |
| — (new) | `shared/README.md` | states the boundary rule the lint config enforces |
| `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `components.json`, `package.json` scripts | edited in place | `dist/`, `release/`, `assets/`, `books/`, `scripts/`, `electron/` do not move |

## Alias and import policy (binding for implementers)

- **Client and tests:** alias, extensionless — `@client/store`, `@shared/book-status`.
- **Server and electron:** alias with the existing `.js` suffix — `@shared/domain.js` — matching the current NodeNext-style convention. Intra-server imports stay relative in P1 (P2 rewrites them).
- **`@client/*` is deliberately absent from the Electron main build's alias map.** If someone imports renderer code from the main process, the build fails loudly instead of shipping a broken DMG.
- Fallback if `.js`-suffixed alias specifiers misresolve under `tsx` or the rollup pass: drop the extension for `@shared/*` only (`moduleResolution: bundler` permits it). Decide this at S3, not later.

## Ordered implementer tasks

**S1 — Baseline evidence.**
Files: none moved; add `scripts/bundle-fingerprint.sh` containing `grep -ohE 'from ?"[^"]+"' dist-electron/*.js | sort -u`.
Run `pnpm test`, `npx tsc --noEmit`, `pnpm lint`, `pnpm electron:build` (DMG optional; `vite build` is the part that matters). Save `scripts/bundle-fingerprint.sh > /tmp/externals-before.txt` and `ls dist/assets | sort > /tmp/dist-before.txt`.
**Accept:** baseline files exist and are non-empty; note the pre-existing lint warning count as the number to not exceed (post-P0 this should be zero).

**S2 — `src/` → `client/`.**
`git mv src client`. Rewrite the 260 `@src/` specifiers to `@client/` with a `ts-morph` script run via `pnpm tsx` (per repo convention; the token is unique so verification is a single grep). Edit: `index.html:27` → `/client/main.tsx`; `tsconfig.json` paths (`@client/*`, keep `@server/*`, drop `@src/*`) and `include` (`client/**/*.ts`, `client/**/*.tsx`, keep `lib/**` for now); `vite.config.ts` `resolve.alias` → `@client`; `vitest.config.ts` alias `@src` → `@client`; `eslint.config.mjs` browser-globals glob `src/**` → `client/**`; `components.json` all five aliases → `@client/...` and `tailwind.css` → `client/index.css`; `package.json` `lint`/`lint:fix` globs, and add `"typecheck": "tsc --noEmit"` if P0 did not.
**Accept:** `grep -rn "@src/" client server electron scripts` empty; `pnpm test` green; `pnpm typecheck` clean; `pnpm lint` warnings ≤ baseline; `pnpm electron:preview` opens the library and renders a chapter.

**S3 — Electron build alias plumbing (no imports change yet).**
File: `vite.config.ts`, inside `electron({ main: { vite: … } })` — add a sibling `resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)), '@server': fileURLToPath(new URL('./server', import.meta.url)) } }`, and add to `external()`, immediately after the `node:` check:
`if (id.startsWith('@shared/') || id.startsWith('@server/')) return false // aliases must be bundled — dist-electron has no alias resolution at runtime`.
Mirror the same two aliases into root `resolve.alias` and `vitest.config.ts`.
**Accept:** `pnpm build` then fingerprint diff vs `/tmp/externals-before.txt` is **empty** (this step is a provable no-op). Landing it before any `@shared` import exists is what makes that assertion meaningful.

**S4 — `lib/` → `shared/`, plus `sanitize-mermaid`.**
`git mv lib/mermaid-theme.ts lib/mermaid-theme.test.ts shared/`; `git mv lib/data-dir.ts shared/node/data-dir.ts`; `git mv client/lib/sanitize-mermaid.ts client/lib/sanitize-mermaid.test.ts shared/`; `rmdir lib`. Rewrite 4 server imports + 2 electron imports of `data-dir` to `@shared/node/data-dir.js`; `MermaidDiagram.tsx` to `@shared/mermaid-theme` and `@shared/sanitize-mermaid`; `electron/main.ts:382-383` to `@shared/sanitize-mermaid.js` / `@shared/mermaid-theme.js`. **Hand-edit the 4 `vi.mock('../../lib/data-dir.js', …)` call sites** in `audiobook-generator.test.ts`, `audiobook-installer.test.ts`, `book-store.test.ts`, `kokoro-service.test.ts` — ts-morph does not touch call-expression string literals. Drop `lib/**` from `tsconfig.include`, the ESLint node-globals glob (add `shared/**`), and the lint script.
**Accept:** `pnpm test` green (the four mocked suites in particular); fingerprint diff empty; `pnpm electron:preview` → export one chapter to EPUB and confirm a Mermaid diagram renders as PNG (this is the only path that exercises the dynamic `@shared` import from main).

**S5 — `server/schemas.ts` → `shared/domain.ts` + `shared/contracts.ts` + `shared/book-status.ts`.**
`git mv server/schemas.ts shared/domain.ts` first (preserves history), then carve the contract half out into `shared/contracts.ts` (which imports `PreferencesSchema`, `SkillSchema` from `./domain.js`) and the status union + five predicates into `shared/book-status.ts` (re-exported from `domain.ts` so nothing else churns). Update the 11 server import lines: type/entity imports → `@shared/domain.js`, `*BodySchema` imports → `@shared/contracts.js`.
**TDD (consolidation delta 9):** write `shared/book-status.test.ts` for the five predicates BEFORE creating `book-status.ts`; commit test first.
**Accept:** `pnpm typecheck` clean; `pnpm test` green; `pnpm dev:server` boots and `curl 127.0.0.1:3147/api/health` returns ok (proves `tsx` resolves the alias); fingerprint diff empty.

**S6 — Client adopts the shared predicates (boundary smoke test).**
Replace the raw status comparisons with predicate calls in exactly: `client/App.tsx:250,313,315,336,340,418,429,437,498,504,892,2005,2015,2100,2141`, `client/components/BookCard.tsx:36,37,116`, `client/components/BookListRow.tsx:59,84`, `client/components/SeriesView.tsx:41,85`. Do **not** touch `ReaderPage.tsx`'s local `Phase` type — it is a different concept that happens to share strings. Do not unify the duplicated local `Book` interfaces (that is P3).
**Accept:** `pnpm test` + `pnpm typecheck` + `pnpm electron:preview`; visually confirm a generating book still shows its spinner, a `toc_review` book still shows the review affordance. This is the first client→`@shared` import through the renderer build, so it validates the whole shape.

**S7 — ESLint boundaries.**
Append to `eslint.config.mjs` (uses the typescript-eslint extension rule so `import type` is covered; ESLint also applies it to dynamic `import()` with a literal — which is what caught the old `main.ts:382` case):

```js
// Import boundaries. client and server never touch; shared is the only
// meeting point and depends on neither. Each group lists the alias form
// and the relative-escape form.
const forbid = (patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
})

{ files: ['client/**/*.{ts,tsx}'], rules: forbid([
    { group: ['@server/**', '**/server/**'],
      message: 'client → server is forbidden. Call the API via client/lib/api.ts; share types through @shared/*.' },
    { group: ['@shared/node/**', '**/shared/node/**'],
      message: '@shared/node/* is Node-only and cannot run in the browser.' },
  ]) },
{ files: ['server/**/*.ts'], rules: forbid([
    { group: ['@client/**', '**/client/**'],
      message: 'server → client is forbidden. Move anything both sides need into shared/.' },
  ]) },
{ files: ['shared/**/*.ts'], rules: forbid([
    { group: ['@client/**', '**/client/**', '@server/**', '**/server/**'],
      message: 'shared/ is the dependency root: it may not import client or server.' },
  ]) },
{ files: ['electron/**/*.ts'], rules: forbid([
    { group: ['@client/**', '**/client/**'],
      message: 'The Electron main process may not import renderer code. Put shared logic in shared/.' },
  ]) },
```

Mechanism choice: core/typescript-eslint `no-restricted-imports` over `eslint-plugin-boundaries` — zero new dependencies, no resolver setup, no `settings.boundaries` element taxonomy, and four zones do not justify a graph engine. It is string-pattern based rather than path-resolution based; the paired alias + `**/zone/**` groups close that gap for every form this repo can produce.
**Accept:** `pnpm lint` at ≤ baseline warnings and **zero errors**; then verify the rules bite — temporarily add `import { store } from '@client/store'` to a server file and confirm an error, then revert.

**S8 — Close out.**
Add `shared/README.md` (three sentences: what belongs here, the `shared/node/` split, the lint rule that enforces it). Full fractal READMEs are P4. Run the complete gate below, then rebase-and-merge the phase branch (consolidation delta 10: never squash).

## Risks, ranked

1. **Alias specifier leaks into `dist-electron/main.js` → packaged app crashes, invisible in dev.** Mitigated by S3 landing before any `@shared` import, and by the fingerprint diff being an acceptance check on *every* subsequent step. If a diff ever shows a new bare specifier, stop and fix `external()`.
2. **`.js`-suffixed alias specifiers misresolve** under `tsx` (dev:server), Vitest, or the rollup pass, since Vite's `.js`→`.ts` fallback must survive alias replacement. Detected by S5's `dev:server` + health-check. Fallback is pre-decided: extensionless `@shared/*`.
3. **`vi.mock()` path strings** silently missed by the AST rewrite in four test files. Fails loudly at S4; listed explicitly above so it cannot be forgotten.
4. **`components.json` drift** — shadcn writes new components to stale paths months later, and nobody notices until a component lands in a deleted folder. Fixed in S2; verify by reading the file, not by running the CLI.
5. **History loss** if any move is done as delete+create. Every move is `git mv`; `git log --follow client/App.tsx` is the check.
6. **P3 collision.** `client/` moves touch all 67 files; P3 must branch from post-P1 `master`, never rebase a pre-P1 branch across it.
7. **Lower:** `culori` is an unbundled external of the `mermaid-theme` chunk (pre-existing, unchanged by this phase — do not "fix" it here); `.claude/worktrees/*` contains full untracked repo copies, so work in a clean worktree and never let a global rewrite script walk into them.

## Phase gate

- [ ] `pnpm test` green, count ≥ baseline
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` zero errors, warnings ≤ baseline
- [ ] `pnpm electron:dev` — library loads, book opens, chapter renders, inline chat streams
- [ ] `pnpm electron:preview` — same four, plus EPUB export with a Mermaid diagram (exercises the main-process `@shared` dynamic import)
- [ ] `pnpm electron:build` completes; `open release/mac-arm64/Tutor.app` launches, library loads, one chapter renders
- [ ] `scripts/bundle-fingerprint.sh` output identical to `/tmp/externals-before.txt`
- [ ] `git log --follow client/App.tsx` and `shared/domain.ts` both show pre-move history
- [ ] `grep -rn "@src/\|from '.*\.\./lib/" client server electron scripts` returns nothing
- [ ] Deliberate cross-boundary import errors, then reverts clean
- [ ] Flag to orchestrator: `shared/book-status.ts` predicates and `shared/contracts.ts` now exist — P3 consumes them; P2 owns any further carve of `shared/domain.ts`
