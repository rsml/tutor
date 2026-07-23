# Tutor — Adaptive Learning Library

AI-generated books tailored to your learning style. Books are generated chapter by chapter with a feedback loop. After each chapter, quiz results and feedback shape how the next one is generated. The book literally rewrites itself based on how you're learning.

## Start here

| Question | Answer lives in |
|---|---|
| How does this fit together? | [`ARCHITECTURE.md`](ARCHITECTURE.md), the entry point, five diagrams |
| What does this word mean? | [`CONTEXT.md`](CONTEXT.md), the domain glossary |
| Why is it built this way? | [`docs/adr/`](docs/adr/README.md), eight decisions and what each cost |
| What endpoints exist? | [`docs/api-routes.md`](docs/api-routes.md), generated, run `pnpm docs:routes` |
| How do I add a capability? | the `add-feature` Agent Skill |
| Is the repo green? | the `verify` Agent Skill |

## How It Works

1. **Create a book.** Enter a topic and a prompt, and the AI generates a table of contents.
2. **Approve the TOC.** Review, edit, and reorder chapters, then approve.
3. **Read chapter by chapter.** Quick, digestible chapters, roughly 1,500 words and a 5 to 10 minute read, each teaching specific concepts.
4. **Inline chat.** Select any text to slide out a chat panel for a deeper AI explanation, then return to where you left off.
5. **Feedback.** After finishing a chapter, say what resonated and what didn't.
6. **Generation triggered.** Submitting feedback starts the next chapter generating in the background.
7. **Quiz while waiting.** An optional 3-question quiz tests retention while the next chapter generates.
8. **Adaptive.** The next chapter incorporates the feedback and quiz results, and a wrong answer triggers a brief recap at its start.

## Repo layout

Each line links to the README that owns that folder. There is no file-by-file tree here on purpose, because it rots.

```
client/      React 19 renderer                    → client/README.md
  api/       the only code that talks to server   → client/README.md
  features/  one folder per capability            → client/features/README.md
server/      embedded Fastify, hexagonal          → server/README.md
  ports/     15 interfaces, fakes, contracts      → server/ports/README.md
  adapters/  the only place real I/O happens      → server/adapters/README.md
  services/  application logic over ports         → server/services/README.md
  migrations/ forward-only schema steps           → server/migrations/README.md
shared/      types both sides import              → shared/README.md
electron/    main and preload, packaging          → electron/README.md
e2e/         Playwright journeys on fakes         → e2e/README.md
docs/        ADRs, generated routes, plans        → docs/adr/README.md
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict) |
| Package manager | pnpm |
| Frontend | React 19 + Vite |
| UI components | shadcn/ui (base-nova style) + CVA + cn() |
| State management | Redux Toolkit (`@reduxjs/toolkit` + `react-redux`) |
| Styling | Tailwind CSS v4 |
| Markdown rendering | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| Backend | Fastify |
| AI | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) |
| Validation | Zod |
| Config | YAML (`yaml` package) |
| Testing | Vitest, Playwright for journeys |

## Key Design Decisions

- **Single-user app.** No auth and no concurrency concerns.
- **Chapter length.** Roughly 1,500 words, a 5 to 10 minute read, flexing longer when the content demands it.
- **TOC approval.** A step-by-step wizard runs before any generation begins.
- **Progress tracking.** Scroll-based auto-tracking, with a chapter completed at 90 percent or more.
- **Generation flow.** Just in time, one chapter at a time, with the quiz masking the latency ([ADR 0002](docs/adr/0002-just-in-time-chapter-generation.md)).
- **Background work.** A `BackgroundTask` lives in memory and is journalled to disk by the `JobJournal` port, so an interrupted one can resume at the next boot ([ADR 0008](docs/adr/0008-persisted-job-journal.md)).
- **Restart mid-generation.** `generate-all` and audiobook jobs resume from disk without redoing finished work. A single interrupted chapter surfaces in the reader's retry panel.
- **Inline chat.** Selecting text opens a slide-out panel for a deeper AI explanation, and dismissing it returns to the reading position.

## Electron Packaging

This is an Electron app using `vite-plugin-electron`. Three modes exist with different behaviors.

| Mode | Command | Renderer loads from | API routing | Origin header |
|------|---------|--------------------|--------------|----|
| **Dev** | `pnpm electron:dev` | `http://localhost:5173` (Vite HMR) | Direct to `http://127.0.0.1:{port}` | `http://localhost:5173` |
| **Preview** | `pnpm electron:preview` | `file://…/dist/index.html` | Direct to `http://127.0.0.1:{port}` | `null` |
| **Build** | `pnpm electron:build` | `file://…/app.asar/dist/index.html` | Direct to `http://127.0.0.1:{port}` | `null` |

### Critical conventions

- **Address.** Always use `127.0.0.1`, never `localhost`, for server communication. This avoids an IPv6 mismatch on macOS.
- **CORS.** The server must accept `Origin: null` (the file protocol) and any `localhost` or `127.0.0.1` origin. Enforced in `server/index.ts:isAllowedOrigin()`.
- **CSP.** Both the `index.html` meta tag and the `electron/main.ts` header must allow `http://localhost:*` and `http://127.0.0.1:*` in `connect-src`.
- **pnpm + electron-builder.** `.npmrc` requires `node-linker=hoisted`. The electron build bundles the unified, remark, and rehype ecosystem into `dist-electron/` via rollup, because electron-builder cannot resolve their deep transitive deps. The bundle list is in `vite.config.ts` `external()`.
- **CJS packages stay external.** If a CJS transitive dep is missing, add it to `package.json` `dependencies`, the way `json-schema-ref-resolver` is there for fastify. A CJS package imported dynamically needs the double-default dance, `mod.default?.default ?? mod.default`, as in `server/adapters/epub-gen-export.ts`.
- **Never modify `index.html` or `package.json` to match build output.** `dist/` is the build target, and source files must keep source references (`/client/app/main.tsx`).

## Development

```bash
pnpm test              # Run all tests
pnpm typecheck         # tsc --noEmit
pnpm lint              # ESLint, zero warnings is the bar
pnpm e2e               # Playwright journeys against the fake AI adapter
pnpm docs:routes       # Regenerate docs/api-routes.md, CI fails on drift
pnpm electron:dev      # Dev mode (Vite + Electron + HMR)
pnpm electron:preview  # Build then run (test production rendering)
pnpm electron:build    # Build + package DMG
pnpm dev:server        # Fastify standalone on port 3147
pnpm mcp:dev           # MCP server, needs dev:server on 3147 (see .mcp.json)
```

## Conventions

- Zod domain schemas live in `shared/`, the single source of truth for both sides.
- YAML for all metadata, Markdown for chapter content.
- The Vercel AI SDK is reached only through the `TextGeneration` port and never imported outside `server/adapters/`.
- Tests are colocated with source files (`*.test.ts`).
- **TDD.** Tests land before or with implementation, visible in commit order. Contract test before adapter, service test before service, api-client test before the client function.
- Path aliases: `@client/*` → `client/*`, `@server/*` → `server/*`, `@shared/*` → `shared/*`.
- Domain names come from `CONTEXT.md`. Do not invent a synonym for a word that already has an owner.

## Domain & Architecture

These are the rules new and refactored code follows. The server conforms today. The client conforms on the api boundary and is still converging elsewhere.

- **Ubiquitous domain language.** `Book`, `Chapter`, `TOC`, `Feedback`, `Quiz`, `Progress`, `LearningProfile`, `Audiobook`, `BackgroundTask`. Use these names everywhere, in schemas, services, components, prompts, and UI copy. `CONTEXT.md` is the register.
- **Pure domain core** in `shared/` and `server/domain/`. Zod types and pure functions only. No `fs`, `fetch`, AI SDK imports, or env vars inside the domain.
- **Ports for every external dependency.** Each gets a single named module the rest of the app depends on by shape, not by SDK. Every port ships an in-memory fake and a contract test.
- **Adapters do the I/O.** Only the adapter touches the SDK, library, child process, or filesystem. Swappable and testable in isolation.
- **Routes are thin.** Parse input, call a service, return the result. No business logic and no direct `fs` or SDK calls in `server/routes/*.ts`.
- **The frontend goes through one client.** Components import from `client/api/`, and a raw `fetch` or `new EventSource` outside it is an ESLint error. A new endpoint gets a function in the client.
- **No new SDK sprinkling.** When adding a third-party SDK, wrap it behind a port first, then consume the port from services.

## UI / Frontend Design

### Desktop-First Design
- Optimize for 1280 to 2560px desktop resolutions, no mobile-first layouts.
- Keyboard-first navigation with shortcuts everywhere (use `lucide-react` icons + `<kbd>`).
- Horizontal layouts: sidebars, resizable panels (shadcn `ResizablePanelGroup`), command palettes.
- Fluid typography and spacing for large screens: `text-3xl` → `text-4xl` on `lg`, `container mx-auto max-w-7xl`.
- Minimum layout target: `min-width: 1024px`.

### shadcn/ui + Tailwind v4
- Use CVA for component variants, `cn()` for class merging, CSS variables from theme.
- Respect system dark mode via `prefers-color-scheme` plus a manual toggle with the shadcn theme provider.
- Build by composition, small shadcn-extended primitives first, then compose pages.
- Use CVA to add custom variants, such as a button with `glass` or `command`.
- Keep logic out of UI files. Prefer hooks and context.

### Page Layout Patterns
- **Header**: centered title only, a draggable region (`-webkit-app-region: drag`), and no navigation buttons inside it.
- **Back button**: an absolute-positioned overlay on the content area below the header, `absolute left-6 top-3 z-20` on a plain `<button>` with `text-content-muted opacity-50 hover:opacity-100`. `client/features/creation/components/CreationView.tsx` is the reference pattern.

### Visual Aesthetic
- Clean, minimal aesthetic inspired by Raycast, Linear, and Obsidian.
- Subtle glassmorphism on floating panels: `backdrop-blur-md bg-background/80 border-border/50`.
- Custom window chrome, no default browser titlebar, with a draggable region via `-webkit-app-region: drag`.
