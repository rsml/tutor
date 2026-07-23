Up: [README.md](README.md)

# Why the suite is built this way

Five decisions shape this suite. Each one traded something away, and this file says what.

## Fakes at the ports, not mocks at HTTP

The server is faked at its ports. Everything between the browser and the AI provider is real, meaning real routes, real services, real domain rules, real YAML on a real disk. Only the four edges that would cost money, need a network, or need a 90MB binary are swapped, through `buildServer(overrides)`, the same seam production uses.

Mocking `fetch` in the browser would have tested the client against a fiction of the server. This tests it against the server.

No journey can reach a live provider. The real key vault is never constructed, the fake one lives only in memory, and the scripted model has no SDK import and throws on any call nobody wrote a fixture for.

## The model answers by intent, not by order

`support/scripted-text-generation.ts` matches on the shape of a request. The unit-test fake answers first-in first-out instead, which is right when the test knows exactly how many calls the code makes. A journey does not know that. Approving a table of contents fires a skill classification, a chapter stream, and a quiz in an order the UI decides and may reorder tomorrow. A fixture list coupled to that order would be the suite's largest source of flake.

Rules are consulted newest first, so one line shadows a default. Failure injection works the same way.

```ts
model.onStreamText({
  name: 'chapter 2 is rate limited',
  match: isChapterStreamFor(2),
  respond: { throws: new Error('rate limit exceeded') },
})
```

`throws` rethrows its value unchanged, so a typed error class survives to the caller.

Two checks keep the scripted model honest. It passes the port's own contract suite in `support/scripted-text-generation.test.ts`, and every generated object goes through `req.schema.parse(value)`, so a drifted fixture fails as loudly as a malformed model response would.

## No test ids

There is not one `data-testid` in the client. Journeys address the UI by role and by name, which means the suite doubles as an accessibility check.

Writing it that way found seven real gaps, filed as issue 51. The worst was a book card rendered as a `div` with an `onClick`, no role, no name, and no focus, so a keyboard user could not open a book at all. Six of the seven are fixed. The context menu keeps its plain buttons deliberately, because an explicit `menuitem` role would replace the `button` role these journeys and a pinned test comment rely on.

The one sanctioned exception is a hidden `<input type="file">`, which has no role or name by construction. It is commented where it appears.

## Zero retries

The flake policy has two halves.

- Never hide nondeterminism. `retries: 0` in `playwright.config.ts`, and quarantine with `test.fixme` plus an issue instead of retrying.
- Go looking for it before CI does. The oversubscription stress run and the `chunkDelayMs` window-widening technique are both described in [README.md](README.md).

The policy has been tested for real. The suite found a production SSE bug on its first day (issue 50, an event stream that closed before its first byte), and a post-merge timing race in one of its own tests. Both were fixed at the root. Neither got a retry.

## Two projects

| Project | Selects | Runs where |
|---|---|---|
| `web` | everything not tagged `@electron` | the `e2e-web` CI job, headless Chromium |
| `electron` | tests tagged `@electron` | the `e2e-electron` CI job, the only one that downloads the Electron binary |

The Electron project exists for one path the web project cannot reach. In a browser, redux-persist writes to localStorage. In the packaged app it writes through IPC to a file the main process owns, so rehydration is only observable with a real main process. Fakes cannot be injected into a packaged main process, which is why that journey seeds its library on disk instead of generating one.

Related: [README.md](README.md), [../docs/adr/0005-ai-sdk-behind-a-port.md](../docs/adr/0005-ai-sdk-behind-a-port.md)
