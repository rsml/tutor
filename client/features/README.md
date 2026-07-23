Up: [ARCHITECTURE.md](../../ARCHITECTURE.md)

# client/features/

One folder per user-facing capability. Each owns its own components, hooks, and slice-local state.

## The ten features

| Feature | Purpose |
|---|---|
| `audiobook` | Voice, download, and regenerate modals, plus the hooks that drive audiobook playback and generation. |
| `chat` | The inline chat panel that answers a question about a selected sentence or passage. |
| `creation` | The book creation wizard, from a topic prompt through streamed TOC review to the first chapter. |
| `library` | The book grid and list views, their toolbar, and the dialogs and context menus reachable from them. |
| `markdown` | Renders chapter markdown safely, including code blocks and mid-stream mermaid diagrams. |
| `profile` | Views and edits the learning profile, including the AI interview flow that fills it in. |
| `progress` | Reviews quiz and skill progress across a book or a single skill. |
| `quiz` | Reviews past quiz answers and runs the spaced-repetition smart-review flow. |
| `reader` | The chapter reading experience, meaning content, feedback, quiz, and generation status. |
| `settings` | API keys, per-task model assignment, theme, and the background texture toggle. |

## Rules

Logic lives in hooks. Components render. All server access goes through `client/api`, so no feature holds a raw `fetch` call.

Shared primitives live in `components/ui/`, available to every feature. Beyond that, a feature imports directly from whichever feature it needs. For example, `reader` reaches into `audiobook`, `chat`, and `markdown`, and `settings` reaches into `profile` and `audiobook`, rather than the two being merged into one folder.

`library/dialogs/dialog-machine.ts` replaces the ad hoc dialog booleans the library page used to carry with a single reducer over a tagged union of the sixteen dialogs the library can show. It is unit-tested at `dialog-machine.test.ts`.

Redux slices live in `client/store/`, one level up. RTK Query was not adopted. Server state is fetched through `client/api` and cached in plain slices instead.

Related: [CONTEXT.md](../../CONTEXT.md), [client/README.md](../README.md)
