Up: [ARCHITECTURE.md](../ARCHITECTURE.md)

# End-to-end journeys

This suite drives the real browser UI against the real Fastify server. Only the server's outermost adapters are swapped for fakes.

Every journey boots the production `buildServer` and hands it fakes through the same `overrides` argument the Electron shell uses. The design reasoning lives in [design.md](design.md). This file is about using the suite.

## Running it

```bash
pnpm e2e                      # everything, both projects
pnpm e2e --project=web        # the browser journeys
pnpm e2e --project=electron   # the packaged-app smoke, needs the Electron binary
pnpm e2e create-book          # one file
pnpm e2e --ui                 # Playwright's time-travel debugger
```

Useful flags.

- `E2E_SKIP_BUILD=1` skips the `dist/` build while you iterate. By default `global-setup.ts` rebuilds every run so a journey can never test yesterday's client.
- `E2E_VERBOSE=1` shows the Fastify log lines, which are suppressed because every test boots its own server.

`pnpm test` is a different suite. It is the fast vitest unit and contract run and it never opens a browser.

## What a journey gets

```ts
import { expect, test } from '../support/app.js'

test('...', async ({ page, model, app }) => { /* ... */ })
```

| Fixture | What it is |
|---|---|
| `page` | A browser page already pointed at this test's own server, so `page.goto('/')` just works |
| `app` | `{ origin, dataDir, bookDir(id), fastify }`. Use `app.fastify.inject(...)` for an API-level assertion |
| `model` | The scripted `TextGeneration` this server is wired to. Add rules before acting, read `model.requests` after |

Plus the helpers.

- `support/seed.ts` puts books on disk through the real filesystem repository.
- `support/journeys/*.ts` are page objects that expose intent, such as `wizard.approveToc()` and `reader.finishChapter()`.
- `fixtures/*.ts` hold the content the scripted model returns, written as TypeScript so `tsc` catches drift.

## Adding a journey

1. Add a `*.spec.ts` under `e2e/journeys/`. Import `test` and `expect` from `../support/app.js`, never from `@playwright/test`. The re-export carries the fixtures.
2. Get to your subject the cheap way. If the journey is about exporting a book, seed one with `seedBook(app.dataDir, ...)` instead of driving the whole creation wizard. A wizard regression should fail the wizard journey, not yours.
3. Address the UI the way a screen reader does. `getByRole` first, `getByText` second, never a CSS class.
4. Assert with `await expect(locator)`, which retries to a deadline. Never sleep.
5. If your journey needs a model call nobody scripted yet, add a rule to `support/default-script.ts` that matches a phrase lifted verbatim from the server prompt, and put the content in `fixtures/`.

## The rules that keep it honest

- `retries: 0`. Everything is in process and faked at the edges, so there is no legitimate source of nondeterminism. A retry could only hide a real bug. A journey that flakes twice gets `test.fixme` and an issue.
- Before trusting a green run on a timing-sensitive change, run `pnpm e2e --project=web --repeat-each=4 --workers=4`. Oversubscribed workers starve the server of CPU the way a busy CI runner does. Repetition on an idle machine proves nothing new.
- To reproduce a suspected race deterministically, give a scripted stream a `chunkDelayMs`. Widening the gap between the UI signal and the server's later write turns a rare race into one that fires every run.
- Quiz options are shuffled with `Math.random()` at save time, so locate an option by its text, never by its position.
- No `data-testid`, anywhere. Why that rule exists, and what it caught, is in [design.md](design.md).

Related: [design.md](design.md), [../server/ports/README.md](../server/ports/README.md)
