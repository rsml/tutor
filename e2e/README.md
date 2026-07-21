# End-to-end journeys

Up: [../README.md](../README.md)

This suite drives the real browser UI against the real Fastify server, with the server's outermost adapters swapped for fakes. It is the answer to a fair question a cold reader asks about a hexagonal codebase, which is whether the ports are load bearing or decorative. Every journey here boots the production `buildServer` and hands it fakes through the same `overrides` argument Electron uses to hand it a diagram renderer, and it works.

## Running it

```bash
pnpm e2e                      # everything, both projects
pnpm e2e --project=web        # the browser journeys
pnpm e2e --project=electron   # the packaged-app smoke, needs the Electron binary
pnpm e2e create-book          # one file
pnpm e2e --ui                 # Playwright's time-travel debugger
```

The run builds `dist/` first, every time, in `global-setup.ts`. That is one code path rather than two, so a journey can never test yesterday's client. Set `E2E_SKIP_BUILD=1` while iterating on a journey to skip it.

Set `E2E_VERBOSE=1` to see the Fastify server's log lines. They are suppressed by default because each test boots its own instance and the JSON request log drowns the reporter.

`pnpm test` is a different thing and stays fast. It is the vitest unit and contract suite and it never opens a browser. The one file under `e2e/` that vitest DOES own is `support/scripted-text-generation.test.ts`, because that test needs no browser.

## What a journey gets

```ts
import { expect, test } from '../support/app.js'

test('...', async ({ page, model, app }) => { /* ... */ })
```

| Fixture | What it is |
|---|---|
| `page` | A browser page already pointed at this test's own server instance, so `page.goto('/')` just works |
| `app` | `{ origin, dataDir, bookDir(id), fastify }`. `app.fastify.inject(...)` gives an API-level assertion without a second HTTP client |
| `model` | The scripted `TextGeneration` this test's server is wired to. Add rules before the action that triggers a call, read `model.requests` after |

Plus the helpers:

- `support/seed.ts` puts books on disk through the real filesystem repository.
- `support/journeys/*.ts` are page objects that expose intent, such as `wizard.approveToc()` and `reader.finishChapter()`.
- `fixtures/*.ts` are the content the scripted model returns, as TypeScript so `tsc` catches drift.

## Adding a journey

1. Add a `*.spec.ts` under `e2e/journeys/`, importing `test` and `expect` from `../support/app.js`, never from `@playwright/test`. The re-export is what carries the fixtures.
2. Get to your subject the cheap way. If the journey is about exporting a book, `seedBook(app.dataDir, ...)` rather than driving the whole creation wizard, so a wizard regression fails the wizard journey and not yours.
3. Address the UI the way a screen reader does. `getByRole` first, `getByText` second, and never a CSS class.
4. Assert with `await expect(locator)...`, which retries to a deadline. Never sleep.
5. If your journey needs a model call nobody has scripted yet, add a rule to `support/default-script.ts` matching a phrase lifted verbatim from the server prompt that produces it, and put the content in `fixtures/`.

## Why fakes rather than mocks

The server is faked at its ports, not mocked at its HTTP boundary. Everything between the browser and the AI provider is the real thing, meaning real routes, real services, real domain rules, real YAML on a real disk. Only the four edges that would cost money, need a network, or need a 90MB binary are swapped, and they are swapped through `buildServer(overrides)`, the same seam production already has.

Mocking `fetch` in the browser instead would have tested the client against a fiction of the server. This tests it against the server.

Zero live-provider traffic is a property of the design rather than a promise. The real key vault is never constructed, the fake one lives only in memory, and the scripted model has no SDK import and throws on any call nobody wrote a fixture for. There is no path from a journey to a provider even if someone wanted one.

## Why the model answers by intent

`support/scripted-text-generation.ts` matches on the shape of a request, not on the order calls arrive in. Phase 2's `createFakeTextGeneration` answers strictly first-in first-out, which is right for a unit test that knows exactly how many calls the code under test makes. A journey does not know that. Approving a table of contents fires a skill classification, a chapter stream, and a quiz, in an order the UI decides and may reorder tomorrow, and a fixture list coupled to that order is the largest available source of flake.

Rules are consulted newest first, so a test shadows a default with one line, which is also how failure injection works:

```ts
model.onStreamText({
  name: 'chapter 2 is rate limited',
  match: isChapterStreamFor(2),
  respond: { throws: new Error('rate limit exceeded') },
})
```

`throws` takes any value and rethrows it unchanged, so a typed error class survives all the way to the caller.

The fidelity guarantee is `support/scripted-text-generation.test.ts`, which runs the port's own contract suite against this adapter with no exemptions, plus `req.schema.parse(value)` on every generated object so a drifted fixture fails as loudly as a malformed model response would.

## Why no test ids

There is not one `data-testid` in the client, and adding one would be the easy way out of every hard locator in this suite. The rule holds because addressing the UI by role and by name means the suite doubles as an accessibility net. Two real gaps were found by writing these journeys and reported rather than papered over, a book card that is a `div` with an `onClick` and therefore carries no role and no accessible name, and a context menu built from plain buttons with no menu semantics.

The one sanctioned exception is a hidden `<input type="file">`, which has no role and no accessible name by construction. It is commented where it appears.

## Flake policy

`retries: 0`, and that is the most load-bearing line in `playwright.config.ts`. The server is in process, the adapters are fakes, and nothing touches a network, so there is no legitimate source of nondeterminism left. A retry could only convert a real bug into a green run. A journey that flakes twice gets quarantined with `test.fixme` and an issue, never a blanket retry.

One real source of nondeterminism does exist inside the product and journeys have to respect it. `server/services/generate-quiz.ts` shuffles a quiz's options with `Math.random()` before saving, so a quiz option must be located by its text and never by its position.

## Projects

| Project | Selects | Runs where |
|---|---|---|
| `web` | everything not tagged `@electron` | the `e2e-web` CI job, Chromium, headless |
| `electron` | tests tagged `@electron` | the `e2e-electron` CI job, which is the only one that downloads the Electron binary |

The Electron project exists for one thing that the web project cannot reach at all. In the browser redux-persist writes to localStorage, and in the packaged app it writes through IPC to a file the main process owns, so the rehydration path is only observable with a real main process. Fakes cannot be injected into a packaged main process, so that journey seeds its library rather than generating one.
