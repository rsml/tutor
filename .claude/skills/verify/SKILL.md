---
name: verify
description: Verify the Tutor repo is green before a commit, a PR, or a handoff. Runs this project's test, typecheck, lint, generated-docs drift, and server boot checks, then reports a pass or fail table.
---

# Verify Tutor

Runs the checks that gate a commit, a PR, or a handoff to another agent in this repo. This is not a general test runner. It is the specific set of commands this project uses to call a change safe.

## When to use

- Before committing.
- Before opening a PR.
- Before handing work to another agent.
- After any change that touches the server routes.

## Steps

Run these in order. Each names the exact command and what to expect.

1. `pnpm test`. Runs the full Vitest suite. Expect every test to pass, with no failures reported.

2. `pnpm typecheck`. Runs `tsc --noEmit`. Expect no output.

3. `pnpm lint`. Runs ESLint across the project with `--max-warnings 0`. Expect no output. Zero warnings is the bar, not zero errors.

4. `pnpm docs:routes && git diff --exit-code docs/api-routes.md`. Regenerates `docs/api-routes.md` from the live route definitions, then fails if the regenerated file differs from what is committed. If it fails, the fix is to commit the regenerated file, not to hand-edit the doc.

5. Boot check. Starts the real server, hits the health endpoint, then stops the server. Run as separate commands so the server can be killed cleanly:

   ```
   pnpm dev:server &
   SERVER_PID=$!
   sleep 2
   curl -s http://127.0.0.1:3147/api/health
   kill $SERVER_PID
   ```

   Expect the curl output to be `{"status":"ok"}`. This binds port 3147, so if an already-running dev server is holding that port, this step fails with `EADDRINUSE`. That is a real signal to go check for a stray server, not noise to ignore or retry past.

Optionally, `pnpm e2e` is a heavier Playwright suite that builds the app and drives a real browser. It is not part of the default set above because of that cost, but run it when a change touches end-to-end reader or generation flows.

## Failure handling

Fix every failure, then rerun the full set from step 1. Never report the first failure and stop partway. If a failing check is out of scope for the current change, say so explicitly in the report, with the actual output as evidence, rather than silently skipping it.

## Report format

Report a markdown table, one row per step, Evidence always a real line copied from the command's actual output, never a paraphrase or a guess.

| Check | Command | Result | Evidence |
|-------|---------|--------|----------|
| Tests | `pnpm test` | Pass | `Test Files  136 passed (136)` |
| Typecheck | `pnpm typecheck` | Pass | (no output) |
| Lint | `pnpm lint` | Pass | (no output) |
| Docs drift | `pnpm docs:routes && git diff --exit-code docs/api-routes.md` | Pass | (no diff) |
| Boot check | `pnpm dev:server` + `curl .../api/health` | Pass | `{"status":"ok"}` |
