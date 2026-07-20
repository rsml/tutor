# shared/

Code that both the React client and the Fastify server depend on. This is the dependency root of the repo, so nothing here may import from `client/` or `server/`, and ESLint enforces that rather than leaving it to discipline.

| Module | Holds |
|---|---|
| `domain.ts` | The entities the app persists and renders, as Zod schemas. Book meta, TOC, progress, feedback, quiz, learning profile, audiobook manifest. |
| `contracts.ts` | The HTTP request and response shapes the client and server agree on, meaning every `*BodySchema` plus the provider and model rules. |
| `book-status.ts` | The six book statuses and the named predicates for asking about them. The only place those strings appear. |
| `mermaid-theme.ts`, `sanitize-mermaid.ts` | Diagram helpers used by both the renderer and the Electron main process during EPUB export. |
| `node/` | The Node-only corner. |

`node/` exists because `data-dir.ts` reads `process.env` and `process.platform`, which cannot run in a browser. Importing it from `client/**` would pull `process` into the renderer bundle, so that import is a lint error, and so is importing it from the browser-safe files sitting directly in `shared/`. Anything added here that touches Node built-ins belongs in `node/`, and everything else belongs at the top level.

One constraint worth knowing before adding a file: the Electron main process is built separately and does not inherit the root Vite config, so any alias it resolves must also be declared in the electron block of `vite.config.ts`. A specifier that escapes bundling survives into `dist-electron/` and the packaged app fails to launch, which dev mode cannot catch. `scripts/bundle-fingerprint.sh` is the check for that.
