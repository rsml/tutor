# Tutor Demo-Quality Refactor — Master Plan

Goal: make this repo a demonstration of pristine AI-assisted engineering for three audiences at once — cold GitHub readers, a live narrated walkthrough, and a live AI-coding session. Strictly behavior-preserving. Owner-decided architecture: monorepo-shaped single package (`client/ server/ shared/ electron/`), fully hexagonal server (ports, adapters, fakes, contract tests), feature-sliced client with one typed API client, TDD-visible history, docs package (6 ADRs, CONTEXT.md, fractal READMEs, generated routes doc, 2 agent skills).

## Phases

| Phase | Branch | Contents | Gate |
|---|---|---|---|
| 0 | `phase-0-safety-net` | Characterization tests (fastify.inject), buildServer() extraction, CI, lefthook, zero lint warnings, hygiene (.DS_Store, talks/ → rsml/talks, stale plans, cruft dirs, pnpm-workspace.yaml), 6 tracking issues | ≥419 tests green twice, CI green, hygiene greps clean |
| 1 | `phase-1-monorepo-shape` | src/→client/, lib/→shared/, schemas→shared/{domain,contracts,book-status}, aliases in all four build entry points, ESLint boundaries, bundle-fingerprint no-op proof | 3 Electron modes boot, fingerprint diff empty, history follows |
| 2 | `phase-2-foundations` then `phase-2-server-hexagonal` | provider consolidation + shared contracts/SSE types (early PR), then ports+fakes+contract tests → adapters → composition root → mechanical route split → 5 parallel service slices → dead code | grep gates (no `ai`/fs/Zod-blocks in routes), contract tests green, books.ts gone, E2E manual pass |
| 3 | `phase-3-client-slices` | Typed api/ client (84 sites), feature slices, App.tsx→~150 lines, dialog state machine, hooks extraction, store/ split, constants, a11y | rg gates (no fetch outside api/), file-size caps, persisted-state byte-identical, manual full pass |
| 4 | `phase-4-docs` | 6 ADRs, CONTEXT.md, 7 fractal READMEs, ~140 JSDoc blocks, CLAUDE.md rewrite, routes-doc generator + CI drift gate, .mcp.json, verify + add-feature skills | every doc path exists, docs:routes idempotent, skills dry-run |
| 5 | `phase-5-final-sweep` | knip + manual simplification sweep, README polish (mermaid, badges), fresh-clone verification script, repo metadata, demo runbook (delivered, not committed) | verify-fresh-clone.sh exits 0 incl. DMG smoke |

Order: 0 → 1 → (2 ∥ 3, separate worktrees, 3 rebases on phase-2-foundations) → 4 → 5.

## Protocol (all phases)

- TDD: test commits land before or with implementation; red-green visible in history.
- Rebase-and-merge only, never squash. Conventional commits.
- Every phase ends: `pnpm test` green, `pnpm typecheck` clean, `pnpm lint` zero warnings, app boots.
- Each phase PR commits its reconciled plan to `docs/plans/refactor/phase-N.md` and lists gate evidence in the body.
- Codemods scope to the tsconfig project; never walk `.claude/worktrees/`.
- See `consolidation.md` for the 15 binding reconciliation deltas across plans.
