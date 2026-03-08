# AI Books — Adaptive Learning Library

AI-generated books tailored to Ross's learning style. Books are generated chapter-by-chapter with a feedback loop: after each chapter, quiz questions and feedback shape how subsequent chapters are generated. The book literally rewrites itself based on how you're learning.

## How It Works

1. **Create a book** — Enter a topic + prompt, AI generates a table of contents
2. **Approve the TOC** — Review, edit, reorder chapters, then approve
3. **Read chapter-by-chapter** — Quick, digestible chapters (~1,500 words, 5-10 min read) teaching specific concepts
4. **Inline chat** — Click any sentence to slide out a chat panel for deeper AI explanation, then return to where you left off
5. **Feedback** — After finishing a chapter, give feedback on what resonated/didn't
6. **Generation triggered** — Submitting feedback triggers next chapter generation in the background
7. **Quiz while waiting** — Optional 3-question quiz to test retention and aid memory while next chapter generates
8. **Adaptive** — Next chapter incorporates feedback + quiz results (wrong answers trigger brief recap at start)

## Architecture

- **Storage:** Filesystem — Markdown chapters + YAML metadata in `books/`
- **Backend:** Fastify server (`server/`)
- **Frontend:** React 19 + Vite (`src/`)
- **AI:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) with structured output via `generateObject()`
- **Learning profile:** Global defaults in `books/learning-profile.yml` with per-book overrides

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
| Testing | Vitest |

## File Structure

```
ai-books/
├── books/                          # Generated content (gitignored except learning-profile)
│   ├── learning-profile.yml        # Global learning style config
│   └── {book-id}/
│       ├── meta.yml                # Status, title, prompt, overrides
│       ├── toc.yml                 # Approved table of contents
│       ├── chapters/
│       │   └── 01.md ... NN.md     # Chapter content (markdown)
│       ├── progress.yml            # Per-chapter scroll progress
│       └── feedback/
│           └── 01.yml ... NN.yml   # Feedback + quiz per chapter
├── server/                         # Backend (Fastify)
│   ├── index.ts                    # Server entry point
│   ├── schemas.ts                  # Zod schemas for all YAML metadata
│   ├── routes/
│   │   ├── books.ts                # CRUD, generation triggers, progress
│   │   ├── chapters.ts             # Chapter content, status, quiz
│   │   └── profile.ts             # Learning profile management
│   ├── services/
│   │   ├── book-generator.ts       # AI generation (TOC, chapters, quiz)
│   │   ├── book-store.ts           # Filesystem read/write
│   │   └── generation-queue.ts     # In-memory background generation tracking
│   └── prompts/
│       ├── generate-toc.md
│       ├── generate-chapter.md
│       └── generate-quiz.md
├── src/                            # Frontend (React + Vite)
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── LibraryPage.tsx         # Book grid with progress bars
│   │   └── ReaderPage.tsx          # Chapter reader + feedback + quiz
│   ├── components/
│   │   ├── BookCard.tsx
│   │   ├── BookGrid.tsx
│   │   ├── WizardModal.tsx         # 3-step: prompt → TOC → generating
│   │   ├── MarkdownReader.tsx      # Renders chapter markdown, clickable sentences
│   │   ├── InlineChatPanel.tsx    # Slide-out AI chat for explaining selected text
│   │   ├── FeedbackForm.tsx
│   │   ├── QuizPanel.tsx
│   │   └── ProgressBar.tsx
│   ├── hooks/
│   │   └── useScrollProgress.ts
│   ├── lib/
│   │   ├── api.ts                  # Fetch wrapper for backend
│   │   └── utils.ts                # cn() helper (shadcn)
│   └── store.ts                    # Redux Toolkit store
├── components.json                 # shadcn/ui config
├── index.html                      # Vite entry
├── vite.config.ts
└── vitest.config.ts
```

## Key Design Decisions

- **Single-user app** — No auth, no concurrency concerns
- **Chapter length** — ~1,500 words (5-10 min), flex longer when content demands
- **TOC approval** — Step-by-step wizard before generation begins
- **Progress tracking** — Scroll-based auto-tracking (completed at ≥90%)
- **Generation flow** — Just-in-time: one chapter at a time, quiz masks latency
- **Background generation** — In-memory `Map<string, GenerationJob>`, fire-and-forget on quiz submit
- **If server restarts mid-generation** — Book stays valid, user can retrigger from the reader
- **Inline chat** — Click any sentence to open a slide-out panel for AI-powered deeper explanation; dismissing returns to reading position

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/books` | List all books |
| `POST` | `/api/books` | Start new book (generates TOC) |
| `GET` | `/api/books/:id` | Get book metadata + progress |
| `DELETE` | `/api/books/:id` | Delete a book |
| `GET` | `/api/books/:id/toc` | Get table of contents |
| `PUT` | `/api/books/:id/toc` | Approve TOC, triggers Ch.1 generation |
| `GET` | `/api/books/:id/chapters/:num` | Get chapter markdown content |
| `GET` | `/api/books/:id/chapters/:num/status` | Check generation status |
| `PUT` | `/api/books/:id/progress/:num` | Update scroll progress |
| `POST` | `/api/books/:id/chapters/:num/feedback` | Submit chapter feedback |
| `GET` | `/api/books/:id/chapters/:num/quiz` | Get quiz questions |
| `POST` | `/api/books/:id/chapters/:num/quiz` | Submit quiz, triggers next chapter |
| `POST` | `/api/books/:id/chapters/:num/chat` | Inline chat about a sentence/passage |
| `GET` | `/api/profile` | Get learning profile |
| `PUT` | `/api/profile` | Update learning profile |

## Electron Packaging

This is an Electron app using `vite-plugin-electron`. Three modes exist with different behaviors:

| Mode | Command | Renderer loads from | API routing | Origin header |
|------|---------|--------------------|--------------|----|
| **Dev** | `pnpm electron:dev` | `http://localhost:5173` (Vite HMR) | Direct to `http://127.0.0.1:{port}` | `http://localhost:5173` |
| **Preview** | `pnpm electron:preview` | `file://…/dist/index.html` | Direct to `http://127.0.0.1:{port}` | `null` |
| **Build** | `pnpm electron:build` | `file://…/app.asar/dist/index.html` | Direct to `http://127.0.0.1:{port}` | `null` |

### Critical conventions

- **Address**: Always use `127.0.0.1` (not `localhost`) for server communication — avoids IPv6 mismatch on macOS
- **CORS**: Server must accept `Origin: null` (file:// protocol) and any `localhost`/`127.0.0.1` origin — enforced in `server/index.ts:isAllowedOrigin()`
- **CSP**: Both `index.html` meta tag and `electron/main.ts` header must allow `http://localhost:*` AND `http://127.0.0.1:*` in `connect-src`
- **pnpm + electron-builder**: `.npmrc` requires `node-linker=hoisted` — pnpm's default symlink strategy breaks electron-builder's dependency resolution. If a transitive dep is missing from the packaged app, add it explicitly to `dependencies` in `package.json`.
- **Never modify `index.html` or `package.json` to match build output** — `dist/` is the build target, source files must keep source references (`/src/main.tsx`)

## Development

```bash
pnpm test              # Run all tests
pnpm electron:dev      # Dev mode (Vite + Electron + HMR)
pnpm electron:preview  # Build then run (test production rendering)
pnpm electron:build    # Build + package DMG
pnpm dev:server        # Fastify standalone on port 3147
```

## Conventions

- Zod schemas live in `server/schemas.ts` — single source of truth for all data shapes
- YAML for all metadata, Markdown for chapter content
- Vercel AI SDK (`ai` package) for all AI calls — prefer `generateObject()` for structured output
- Tests colocated with source files (`*.test.ts`)
- Path aliases: `@src/*` → `src/*`, `@server/*` → `server/*`

## UI / Frontend Design

### Desktop-First Design
- Optimize for 1280–2560px desktop resolutions — no mobile-first layouts
- Keyboard-first navigation with shortcuts everywhere (use `lucide-react` icons + `<kbd>`)
- Horizontal layouts: sidebars, resizable panels (shadcn `ResizablePanelGroup`), command palettes (`cmdk`)
- Fluid typography/spacing for large screens: `text-3xl` → `text-4xl` on `lg`, `container mx-auto max-w-7xl`
- Minimum layout target: `min-width: 1024px`

### shadcn/ui + Tailwind v4
- Use CVA for component variants, `cn()` for class merging, CSS variables from theme
- Respect system dark mode via `prefers-color-scheme` + manual toggle with shadcn theme provider
- Build using composition: small shadcn-extended primitives first (e.g., `<AppSidebar />`, `<ResizablePanelGroup orientation="horizontal">`), then compose pages
- Use CVA to add custom variants (e.g., button with `glass`, `command`)
- Keep logic out of UI files — prefer hooks + context

### Page Layout Patterns
- **Header**: Centered title only, draggable region (`-webkit-app-region: drag`), no navigation buttons inside header
- **Back button**: Absolute-positioned overlay on the content area below the header — `absolute left-6 top-3 z-20` on a plain `<button>` with `text-content-muted/50 hover:text-content-muted`. See `ReaderPage.tsx:339-344` as the reference pattern.

### Visual Aesthetic
- Clean, minimal aesthetic inspired by Raycast, Linear, Obsidian
- Subtle glassmorphism on floating panels: `backdrop-blur-md bg-background/80 border-border/50`
- Custom window chrome: no default browser titlebar; implement draggable region with `-webkit-app-region: drag`
