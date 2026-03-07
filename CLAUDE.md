# AI Books — Adaptive Learning Library

AI-generated books tailored to Ross's learning style. Books are generated chapter-by-chapter with a feedback loop: after each chapter, quiz questions and feedback shape how subsequent chapters are generated. The book literally rewrites itself based on how you're learning.

## How It Works

1. **Create a book** — Enter a topic + prompt, AI generates a table of contents
2. **Approve the TOC** — Review, edit, reorder chapters, then approve
3. **Read chapter-by-chapter** — Each chapter is ~1,500 words (5-10 min read)
4. **Feedback loop** — After each chapter: submit what resonated/didn't, answer 3 quiz questions
5. **Adaptive generation** — Next chapter incorporates your feedback + quiz results (wrong answers trigger brief recap)
6. **Just-in-time** — Chapters generate one at a time; quiz masks generation latency

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
│   │   ├── MarkdownReader.tsx      # Renders chapter markdown
│   │   ├── FeedbackForm.tsx
│   │   ├── QuizPanel.tsx
│   │   └── ProgressBar.tsx
│   ├── hooks/
│   │   └── useScrollProgress.ts
│   └── lib/
│       └── api.ts                  # Fetch wrapper for backend
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
| `GET` | `/api/profile` | Get learning profile |
| `PUT` | `/api/profile` | Update learning profile |

## Development

```bash
pnpm test              # Run all tests
pnpm dev:server        # Fastify on port 3147
pnpm dev               # Vite on port 5173
```

## Conventions

- Zod schemas live in `server/schemas.ts` — single source of truth for all data shapes
- YAML for all metadata, Markdown for chapter content
- Vercel AI SDK (`ai` package) for all AI calls — prefer `generateObject()` for structured output
- Tests colocated with source files (`*.test.ts`)
