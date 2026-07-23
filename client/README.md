Up: [ARCHITECTURE.md](../ARCHITECTURE.md)

# client/

The React 19 renderer, built with Vite and rendered inside Electron's sandboxed window.

## Where to look

| Folder | Holds |
|---|---|
| `app/` | The root component and the Vite entry point. |
| `api/` | The only code that talks to the server. |
| `features/` | One folder per user-facing capability. See [`features/README.md`](features/README.md). |
| `components/ui/` | shadcn primitives shared across every feature. |
| `hooks/` | React hooks shared across more than one feature. |
| `lib/` | Framework-free helpers, no React and no I/O. |
| `store/` | The Redux Toolkit slices and their persistence setup. |

## Rules ESLint enforces

Two rules here are lint errors rather than conventions.

A file outside `client/api/` may not call `fetch`. The client used to hold eighty four scattered fetch calls, and the only durable reason it now holds none is that adding one fails the build.

The same rule covers `new EventSource`, because the background task stream used to be constructed in two separate components, each with its own idea of when to reconnect. Reach the server through `client/api` in both cases.

`client/` may also not import from `server/`, and it may not import `@shared/node/*`. That corner is Node-only, and importing it from the renderer would pull `process` into the client bundle.

`client/lib/mcp-config.ts` builds the MCP launch command that the creation wizard copies to the clipboard after starting an agentic book.

Related: [CONTEXT.md](../CONTEXT.md), [client/features/README.md](features/README.md), [electron/README.md](../electron/README.md), [server/README.md](../server/README.md), [shared/README.md](../shared/README.md), [0004-single-package-monorepo-shaped.md](../docs/adr/0004-single-package-monorepo-shaped.md)
