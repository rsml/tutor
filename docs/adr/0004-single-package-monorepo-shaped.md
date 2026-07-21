# 0004. Single package, monorepo-shaped

Status: Accepted
Date: 2026-07-21

## Context

One `package.json` used to serve the React app, the Fastify server, the Electron shell, and a shared library, and their imports were tangled across all four. Real pnpm workspaces would add hard boundaries, but they would also add resolution complexity on top of an Electron build that already fights pnpm.

## Decision

The repo is split into top-level `client/`, `server/`, `shared/`, and `electron/` folders, reached through `@client/*`, `@server/*`, and `@shared/*` aliases declared in both [`tsconfig.json`](../../tsconfig.json) and [`vite.config.ts`](../../vite.config.ts). [`eslint.config.mjs`](../../eslint.config.mjs) enforces the boundary between them with the rule `@typescript-eslint/no-restricted-imports`, which forbids server code from importing client code and client code from importing server code. A second rule, `no-restricted-syntax`, forces every client-to-server call through `client/api/` rather than a raw `fetch` or `EventSource` constructed elsewhere. `shared/` may import neither zone. All of it still runs from one `package.json`, one lockfile, and one `node_modules`, with `node-linker=hoisted` set in `.npmrc`.

## Consequences

**What this buys**
- It enforces the same import boundaries a real workspace would give, starting today, without adding the build risk a workspace migration would bring to the Electron packaging that [ADR 0006](0006-electron-packaging-constraints.md) describes.
- It keeps one install and one test command, `pnpm test`, for the whole repo.

**What this costs**
- Dependencies stay unpartitioned, so nothing but lint and code review stops a client-only library from being imported on the server, or the reverse.
- The four zones cannot version independently.

**Deliberately out of scope.** Observability and telemetry, a security-hardening pass, and release engineering were all considered and declined, because Tutor runs locally on one machine with no cloud component and no multi-user surface for any of them to protect.

## Revisit when

A second application wants to consume `shared/`, or CI time justifies per-package caching. The folders are already package-shaped for that move. Adding `pnpm-workspace.yaml` and a `package.json` per folder is mechanical once the import boundaries above have held for a while, but `node-linker=hoisted` and the `external()` allow-list in `vite.config.ts` need re-verifying across all three Electron modes first.
