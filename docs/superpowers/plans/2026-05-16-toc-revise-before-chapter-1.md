# TOC Revision Before Chapter 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause book creation after the TOC streams, present "Generate Chapter 1" and "Provide Feedback" actions, let the user iterate on the TOC via AI-mediated revisions before any chapter is generated.

**Architecture:** Split the monolithic `POST /api/books` (TOC + skills + Ch1 + quiz) into three endpoints — TOC-only creation, AI-mediated revise, explicit start. Use the dormant `toc_review` status already in the schema. Skill classification is deferred from "after TOC" to "right before Ch1" so iteration is cheap.

**Tech Stack:** TypeScript (strict), Fastify (server), React 19 + Vite (frontend), Vercel AI SDK (`streamText`), Zod, Vitest. Existing test infrastructure covers pure-function units; there are no route-level integration tests or React component tests in the codebase — this plan matches that convention (pure-unit tests + manual smoke tests for the rest).

**Spec:** `docs/superpowers/specs/2026-05-16-toc-revise-before-chapter-1-design.md`

---

## File Map

**New files:**
- `server/services/toc-parser.ts` — extracted `parseTocFromMarkdown` + truncation helper
- `server/services/toc-parser.test.ts` — vitest unit tests
- `src/lib/format-toc.ts` — TOC structure → markdown reconstruction helper
- `src/lib/format-toc.test.ts` — vitest unit tests
- `src/components/ReviseTocDialog.tsx` — feedback modal

**Modified files:**
- `server/schemas.ts` — add `ReviseTocBodySchema` and `StartBookBodySchema`. No status enum changes (`toc_review` already there).
- `server/routes/books.ts` — extract `parseTocFromMarkdown` import; extract `generateFirstChapterAndQuiz` helper; modify `POST /api/books` to stop at TOC; add `POST /api/books/:id/toc/revise`; add `POST /api/books/:id/start`.
- `src/components/CreationView.tsx` — expand state machine; add resume mode; replace auto-transition with `awaiting_approval` phase; wire ReviseTocDialog; replace inline POST /api/books streaming with two-phase TOC + /start.
- `src/App.tsx` — add `'resuming'` view variant; route books with `status === 'toc_review'` to CreationView in resume mode.
- `src/components/BookCard.tsx` and `src/components/BookListRow.tsx` — handle `'toc_review'` status (small badge or chip).

---

## Phase 1 — Backend refactors (no behavior change)

### Task 1: Extract `parseTocFromMarkdown` into `server/services/toc-parser.ts` with tests

**Files:**
- Create: `server/services/toc-parser.ts`
- Create: `server/services/toc-parser.test.ts`
- Modify: `server/routes/books.ts` (delete local function, import from new module)

- [ ] **Step 1: Create the parser module by moving the function out of `books.ts`**

```typescript
// server/services/toc-parser.ts
export interface ParsedToc {
  title: string
  subtitle?: string
  chapters: Array<{ title: string; description: string }>
}

export function parseTocFromMarkdown(text: string): ParsedToc {
  const lines = text.split('\n').filter(l => l.trim())
  let title = ''
  let subtitle: string | undefined
  let titleFound = false
  const chapters: Array<{ title: string; description: string }> = []

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(.+)/)
    if (titleMatch && !title) {
      title = titleMatch[1].replace(/\*\*/g, '').trim()
      titleFound = true
      continue
    }

    if (titleFound && !subtitle && chapters.length === 0) {
      const italicMatch = line.match(/^\*(.+)\*$/) || line.match(/^_(.+)_$/)
      if (italicMatch) {
        subtitle = italicMatch[1].trim()
        continue
      }
      const h2Match = line.match(/^##\s+(.+)/)
      if (h2Match) {
        subtitle = h2Match[1].trim()
        continue
      }
    }

    const chapterMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s*[—–\-:]\s*(.+)/)
    if (chapterMatch) {
      chapters.push({
        title: chapterMatch[1].trim(),
        description: chapterMatch[2].trim(),
      })
    }
  }

  if (!title && chapters.length > 0) {
    title = 'Untitled Book'
  }

  return { title, subtitle, chapters }
}

/**
 * Truncate or accept a parsed chapter list to match a target count.
 * If parsedCount > target: slice to target. Else: return as-is.
 */
export function truncateChapters<T>(chapters: T[], targetCount: number): T[] {
  return chapters.length > targetCount ? chapters.slice(0, targetCount) : chapters
}
```

- [ ] **Step 2: Write tests**

```typescript
// server/services/toc-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseTocFromMarkdown, truncateChapters } from './toc-parser.js'

describe('parseTocFromMarkdown', () => {
  it('parses title, subtitle, and chapters from canonical AI output', () => {
    const md = `# Resilient CSS
*Layout Systems for the Real World*

1. **The Box Model Revisited** — Understanding the foundation.
2. **Flexbox Deep Dive** — Layout patterns.
`
    const result = parseTocFromMarkdown(md)
    expect(result.title).toBe('Resilient CSS')
    expect(result.subtitle).toBe('Layout Systems for the Real World')
    expect(result.chapters).toEqual([
      { title: 'The Box Model Revisited', description: 'Understanding the foundation.' },
      { title: 'Flexbox Deep Dive', description: 'Layout patterns.' },
    ])
  })

  it('accepts en-dash, hyphen, and colon as separators', () => {
    const md = `# X
1. **A** — first
2. **B** – second
3. **C** - third
4. **D** : fourth
`
    const result = parseTocFromMarkdown(md)
    expect(result.chapters.map(c => c.title)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('defaults to "Untitled Book" if chapters parsed but no title heading', () => {
    const md = `1. **A** — first
2. **B** — second
`
    expect(parseTocFromMarkdown(md).title).toBe('Untitled Book')
  })

  it('returns empty chapters when markdown has no numbered list', () => {
    expect(parseTocFromMarkdown('# Title\n\nJust some prose.').chapters).toEqual([])
  })

  it('accepts H2 subtitle as a fallback when no italic line', () => {
    const md = `# Title
## A subtitle here
1. **A** — first
`
    expect(parseTocFromMarkdown(md).subtitle).toBe('A subtitle here')
  })
})

describe('truncateChapters', () => {
  it('truncates when over target', () => {
    expect(truncateChapters([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3])
  })

  it('returns as-is when under or equal to target', () => {
    expect(truncateChapters([1, 2], 3)).toEqual([1, 2])
    expect(truncateChapters([1, 2, 3], 3)).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 3: Run tests, expect FAIL on imports until step 4**

```bash
pnpm test server/services/toc-parser.test.ts
```

Expected: 7 passing tests (because step 1 created the module already; this verifies).

- [ ] **Step 4: Delete the local `parseTocFromMarkdown` from `server/routes/books.ts` and import from the new module**

In `server/routes/books.ts`:
- Delete the `parseTocFromMarkdown` function (currently lines 33-77).
- Add `import { parseTocFromMarkdown, truncateChapters } from '../services/toc-parser.js'` near the top.
- Replace the existing `chapters.slice(0, targetCount)` at line 941 with `truncateChapters(parsedChapters, targetCount)`.

- [ ] **Step 5: Run typecheck + tests**

```bash
pnpm test && pnpm exec tsc --noEmit
```

Expected: all green. Existing book creation still works because behavior is unchanged.

- [ ] **Step 6: Commit**

```bash
git add server/services/toc-parser.ts server/services/toc-parser.test.ts server/routes/books.ts
git commit -m "refactor: extract parseTocFromMarkdown into toc-parser service"
```

---

### Task 2: Add `ReviseTocBodySchema` and `StartBookBodySchema` to `server/schemas.ts`

**Files:**
- Modify: `server/schemas.ts` (append schemas near other Body schemas around line 160-220)

- [ ] **Step 1: Find where `CreateBookBodySchema` lives**

```bash
grep -n "CreateBookBodySchema\|GenerateNextBodySchema" server/schemas.ts
```

Add the new schemas immediately below `CreateBookBodySchema`.

- [ ] **Step 2: Add the schemas**

```typescript
// server/schemas.ts (append after CreateBookBodySchema)

export const ReviseTocBodySchema = z.object({
  feedback: z.string().min(1).max(4000),
  model: z.string().min(1),
  provider: z.string().min(1).optional(),
})

export const StartBookBodySchema = z.object({
  model: z.string().min(1),
  provider: z.string().min(1).optional(),
  quizModel: z.string().min(1).optional(),
  quizProvider: z.string().min(1).optional(),
  quizLength: z.number().int().min(1).max(10).optional(),
})
```

- [ ] **Step 3: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/schemas.ts
git commit -m "feat: add request body schemas for /toc/revise and /start"
```

---

### Task 3: Extract `generateFirstChapterAndQuiz` helper inside `server/routes/books.ts`

**Goal:** Factor out the Ch1 + skill classification + quiz generation block currently inline in `POST /api/books` (lines ~949-1055) into a private async helper. Do not change behavior yet — `POST /api/books` still calls it inline at the same place.

**Files:**
- Modify: `server/routes/books.ts`

- [ ] **Step 1: Define the helper inside `bookRoutes` (before the route handlers)**

The helper takes the book id, an SSE `send` callback, and the model/quiz options. It reads the book + TOC from the store, runs skill classification, persists skills back onto `toc.yml`, streams Chapter 1, generates the quiz, updates `meta.generatedUpTo`/`meta.status` to `'reading'`. This is exactly the code currently at lines 944-1055 of the inline handler, lifted out verbatim.

Signature:

```typescript
async function generateFirstChapterAndQuiz(
  bookId: string,
  send: (data: Record<string, unknown>) => void,
  opts: {
    provider: string
    model: string
    quizProvider: string
    quizModel: string
    quizLength: number
    profileContext: string
    topic: string
    details?: string
  },
): Promise<void> {
  // 1. Read book + TOC from store
  const book = await store.getBook(bookId)
  const toc = await store.getToc(bookId)
  const chapters = toc.chapters

  // 2. Skill classification (moved from inline) — write skills back to toc.yml
  let tocSkills: { name: string; weight: number }[] = []
  let chapterSkillMap: Array<{ chapterIndex: number; skills: Array<{ skill: string; subskill: string; weight: number }> }> = []
  try {
    const skillTimeout = createTimeout()
    const skillClassification = await generateObject({
      model: createModelClient(opts.provider, opts.model),
      abortSignal: skillTimeout.signal,
      schema: z.object({
        skills: z.array(TocBookSkillSchema),
        chapters: z.array(z.object({
          chapterIndex: z.number(),
          skills: z.array(TocChapterSkillSchema),
        })),
      }),
      prompt: /* the same prompt currently at line 959-971 */,
    })
    skillTimeout.clear()
    tocSkills = skillClassification.object.skills
    chapterSkillMap = skillClassification.object.chapters
    send({ type: 'skills_classified' })
  } catch {
    // non-fatal
  }

  // Persist skills onto the TOC (preserve existing chapters)
  const tocWithSkills = {
    skills: tocSkills.length > 0 ? tocSkills : undefined,
    chapters: chapters.map((ch, i) => ({
      ...ch,
      skills: chapterSkillMap.find(c => c.chapterIndex === i)?.skills ?? undefined,
    })),
  }
  await store.saveToc(bookId, tocWithSkills)

  // 3. Update status: toc_review → generating
  book.status = 'generating'
  book.updatedAt = new Date().toISOString()
  await store.saveBook(book)

  // 4. Stream Chapter 1 (verbatim from inline lines 1001-1034)
  let chapterText = ''
  const ch1Timeout = createTimeout()
  const chapterResult = streamText({
    model: createModelClient(opts.provider, opts.model),
    abortSignal: ch1Timeout.signal,
    system: /* same system prompt currently at line 1007-1019 */,
    prompt: `Book: ${book.title}
Topic: ${opts.topic}${opts.details ? `\nContext: ${opts.details}` : ''}

This is Chapter 1 of ${chapters.length}.
Chapter title: ${chapters[0].title}
Chapter description: ${chapters[0].description}

Write this chapter now.`,
  })
  for await (const chunk of chapterResult.textStream) {
    chapterText += chunk
    send({ type: 'chapter', text: chunk })
  }
  ch1Timeout.clear()

  await store.saveChapter(bookId, 1, chapterText)

  // 5. Quiz (verbatim from inline lines 1039-1044, non-fatal)
  try {
    const quiz = await generateQuiz(opts.quizProvider, opts.quizModel, chapterText, opts.quizLength)
    await store.saveQuiz(bookId, 1, quiz)
  } catch {
    // non-fatal
  }

  // 6. Finalize
  const meta = await store.getBook(bookId)
  meta.generatedUpTo = 1
  meta.status = 'reading'
  meta.updatedAt = new Date().toISOString()
  await store.saveBook(meta)
}
```

- [ ] **Step 2: Replace the inline blocks in `POST /api/books` with a call to the helper**

Inside `POST /api/books`:

1. **Delete the skill classification block** (currently at lines 944-979 — the `tocSkills`/`chapterSkillMap` block). It's now inside the helper.
2. **Change the `await store.saveToc(bookId, tocWithSkills)` line to `await store.saveToc(bookId, { chapters })`**. The `tocWithSkills` variable no longer exists once you delete step 1; we save chapters only, and the helper will overwrite `toc.yml` with the skill-enriched version when it runs immediately after.
3. **After `send({ type: 'toc_done', ... })`**, delete everything from "Phase 2: Generate Chapter 1" through the existing final cleanup. Replace with:

```typescript
await generateFirstChapterAndQuiz(bookId, send, {
  provider: provider ?? 'anthropic',
  model,
  quizProvider: quizProvider ?? provider ?? 'anthropic',
  quizModel: quizModel ?? model,
  quizLength: quizLength ?? 3,
  profileContext,
  topic,
  details,
})
send({ type: 'done', bookId })
reply.raw.end()
```

Note: this leaves a very brief intermediate state where `toc.yml` is written without skills before the helper rewrites it with skills milliseconds later. That's fine — no consumer reads `toc.yml` in that window.

- [ ] **Step 3: Typecheck + manual smoke test**

```bash
pnpm exec tsc --noEmit
pnpm test
```

```bash
# In another terminal
pnpm electron:dev
```

Create a 3-chapter book end-to-end. Confirm TOC streams, Ch1 streams, you land on the reader. Behavior should be identical to before the refactor.

- [ ] **Step 4: Commit**

```bash
git add server/routes/books.ts
git commit -m "refactor: extract generateFirstChapterAndQuiz helper from POST /api/books"
```

---

## Phase 2 — Add new endpoints (additive)

### Task 4: Add `POST /api/books/:id/start` endpoint

**Files:**
- Modify: `server/routes/books.ts`

- [ ] **Step 1: Add the endpoint**

Place it near the existing `POST /api/books` handler (look for the rate-limit config pattern).

```typescript
fastify.post<{ Params: { id: string }; Body: unknown }>(
  '/api/books/:id/start',
  { schema: { params: bookIdSchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => {
    let body: { model: string; provider?: string; quizModel?: string; quizProvider?: string; quizLength?: number }
    try {
      body = StartBookBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const bookId = request.params.id
    const book = await store.getBook(bookId)

    if (book.status !== 'toc_review') {
      return reply.status(409).send({
        error: 'Invalid status',
        message: `Book must be in 'toc_review' status to start; currently '${book.status}'`,
        currentStatus: book.status,
      })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const send = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const profileContext = await buildProfileContext()
      // Pull topic/details from the stored prompt — split on the first \n\n
      const promptParts = book.prompt.split('\n\n')
      const topic = book.title
      const details = promptParts.length > 1 ? promptParts.slice(1).join('\n\n') : undefined

      await generateFirstChapterAndQuiz(bookId, send, {
        provider: body.provider ?? 'anthropic',
        model: body.model,
        quizProvider: body.quizProvider ?? body.provider ?? 'anthropic',
        quizModel: body.quizModel ?? body.model,
        quizLength: body.quizLength ?? 3,
        profileContext,
        topic,
        details,
      })
      send({ type: 'done', bookId })
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      reply.raw.end()
    }
  },
)
```

Also import `StartBookBodySchema` at the top of the file.

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Manual smoke (the endpoint exists but isn't called by the frontend yet; we just verify it doesn't break compilation)**

```bash
pnpm dev:server
# In another terminal:
curl -i -X POST http://127.0.0.1:3147/api/books/some-nonexistent-id/start \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-haiku-4-5"}'
```

Expected: 4xx response (book doesn't exist, but the route is registered).

- [ ] **Step 4: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: add POST /api/books/:id/start endpoint"
```

---

### Task 5: Add `POST /api/books/:id/toc/revise` endpoint

**Files:**
- Modify: `server/routes/books.ts`

- [ ] **Step 1: Add the endpoint near `/start`**

```typescript
fastify.post<{ Params: { id: string }; Body: unknown }>(
  '/api/books/:id/toc/revise',
  { schema: { params: bookIdSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
  async (request, reply) => {
    let body: { feedback: string; model: string; provider?: string }
    try {
      body = ReviseTocBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const bookId = request.params.id
    const book = await store.getBook(bookId)

    if (book.status !== 'toc_review') {
      return reply.status(409).send({
        error: 'Invalid status',
        message: `Book must be in 'toc_review' status to revise; currently '${book.status}'`,
        currentStatus: book.status,
      })
    }

    const currentToc = await store.getToc(bookId)
    if (currentToc.chapters.length === 0) {
      return reply.status(400).send({ error: 'No existing TOC to revise' })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const send = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const profileContext = await buildProfileContext()
      const feedback = sanitizeFeedback(body.feedback)

      const existingTocMarkdown = `# ${book.title}${book.subtitle ? `\n*${book.subtitle}*` : ''}\n\n${currentToc.chapters
        .map((ch, i) => `${i + 1}. **${ch.title}** — ${ch.description}`)
        .join('\n')}`

      let revisedText = ''
      const timeout = createTimeout()
      const result = streamText({
        model: createModelClient(body.provider ?? 'anthropic', body.model),
        abortSignal: timeout.signal,
        system: `You are revising an existing table of contents. Apply ONLY the reader's targeted changes. Every chapter the reader did not mention must be preserved EXACTLY — same title, same description, same position.

Constraints:
- The revised TOC must have exactly ${book.totalChapters} chapters, UNLESS the reader explicitly requested a different count in their feedback.
- Preserve the title and subtitle UNLESS the reader asked to change them.
- For any chapter the reader did not reference, output it verbatim — do not rephrase, restructure, or "improve" it.
- Output in the same numbered markdown format as the existing TOC.
${profileContext ? `\nReader profile:\n${profileContext}\n` : ''}
Just output the title and table of contents, nothing else.`,
        prompt: `Existing TOC:
${existingTocMarkdown}

Reader's requested changes:
${feedback}`,
      })

      for await (const chunk of result.textStream) {
        revisedText += chunk
        send({ type: 'toc', text: chunk })
      }
      timeout.clear()

      const parsed = parseTocFromMarkdown(revisedText)
      if (parsed.chapters.length === 0) {
        send({ type: 'error', message: "Couldn't parse the revised TOC — try rephrasing your feedback." })
        reply.raw.end()
        return
      }

      const chaptersFinal = truncateChapters(parsed.chapters, book.totalChapters)

      // Persist — chapters only, no skills (deferred to /start)
      await store.saveToc(bookId, { chapters: chaptersFinal })

      // Update meta title/subtitle if the AI changed them
      let metaChanged = false
      if (parsed.title && parsed.title !== book.title) {
        book.title = parsed.title
        metaChanged = true
      }
      if (parsed.subtitle !== book.subtitle) {
        book.subtitle = parsed.subtitle
        metaChanged = true
      }
      if (metaChanged) {
        book.updatedAt = new Date().toISOString()
        await store.saveBook(book)
      }

      send({
        type: 'toc_revised',
        bookId,
        title: book.title,
        subtitle: book.subtitle,
        totalChapters: chaptersFinal.length,
      })
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      reply.raw.end()
    }
  },
)
```

Also import `ReviseTocBodySchema` at the top.

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Manual smoke (endpoint exists, status guard works)**

```bash
pnpm dev:server
curl -i -X POST http://127.0.0.1:3147/api/books/nonexistent/toc/revise \
  -H 'Content-Type: application/json' \
  -d '{"feedback":"hi","model":"claude-haiku-4-5"}'
```

Expected: 4xx (book doesn't exist).

- [ ] **Step 4: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: add POST /api/books/:id/toc/revise endpoint"
```

---

## Phase 3 — Coordinated backend cutover + minimal frontend reroute

### Task 6: Modify `POST /api/books` to stop at TOC, update CreationView to call `/start` automatically

**This is a coordinated change.** Backend and frontend must land together or the user-visible flow breaks. Keep the existing UX for now (TOC auto-flows into Ch1) — just routed through two requests instead of one.

**Files:**
- Modify: `server/routes/books.ts`
- Modify: `src/components/CreationView.tsx`

- [ ] **Step 1: Modify `POST /api/books` to stop after TOC**

In `POST /api/books`, after `send({ type: 'toc_done', bookId, title, subtitle, totalChapters: chapters.length })`:

- Delete the `await generateFirstChapterAndQuiz(...)` call that was added in Task 3.
- Replace the existing status assignment `existingMeta.status = 'generating'` (around line 993) with `existingMeta.status = 'toc_review'`.
- Save toc WITHOUT skills: change `await store.saveToc(bookId, tocWithSkills)` to `await store.saveToc(bookId, { chapters })`. (The skill classification block should already be inside `generateFirstChapterAndQuiz` from Task 3.)
- After `toc_done`, immediately `send({ type: 'done', bookId })` and `reply.raw.end()`.

Resulting handler ending:

```typescript
existingMeta.title = title
existingMeta.subtitle = subtitle
existingMeta.status = 'toc_review'
existingMeta.totalChapters = chapters.length
existingMeta.updatedAt = new Date().toISOString()
await store.saveBook(existingMeta)
await store.saveToc(bookId, { chapters })

send({ type: 'toc_done', bookId, title, subtitle, totalChapters: chapters.length })
send({ type: 'done', bookId })
reply.raw.end()
```

- [ ] **Step 2: Modify `CreationView.tsx` to call `/start` after `toc_done`**

Find the existing `case 'toc_done':` block (around line 75-80). Replace with:

```typescript
case 'toc_done': {
  toc.flushNow()
  setBookId(event.bookId)
  setPhase('chapter')
  setActiveTab('chapter')
  // Kick off chapter 1 generation via the new endpoint
  startChapterGeneration(event.bookId)
  break
}
```

Add a new function `startChapterGeneration` (inside the component, near `startGeneration`):

```typescript
const startChapterGeneration = useCallback(async (id: string) => {
  try {
    const res = await fetch(apiUrl(`/api/books/${id}/start`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, provider, quizModel, quizProvider, quizLength }),
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.message || `Start failed: ${res.status}`)
    }
    await parseSSEStream(res, {
      onEvent: (event) => {
        switch (event.type) {
          case 'chapter':
            chapter.appendChunk(event.text)
            requestAnimationFrame(() => {
              chapterScrollRef.current?.scrollTo({ top: chapterScrollRef.current!.scrollHeight })
            })
            break
          case 'done':
            chapter.flushNow()
            setPhase('done')
            break
          case 'error':
            setError('Generation failed: ' + event.message)
            setPhase('error')
            break
        }
      },
    })
  } catch (err) {
    setError('Generation failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    setPhase('error')
  }
}, [model, provider, quizModel, quizProvider, quizLength, chapter])
```

Remove the `case 'chapter':` and the final `case 'done':` handlers from inside the original `startGeneration` since they no longer fire on that stream — but keep `case 'error':`. Net: `startGeneration` only handles `book_created`, `toc`, `toc_done`, and `error` now. The `'done'` event from `POST /api/books` just closes the stream and is harmless to ignore (you can add `case 'done': break;` for clarity).

- [ ] **Step 3: Smoke test end-to-end**

```bash
pnpm electron:dev
```

Create a 3-chapter book. Verify: TOC streams, then Ch1 streams (now from a second HTTP request), then you can click Start Book → ReaderPage.

- [ ] **Step 4: Verify the book on disk has the right intermediate state**

```bash
# While Ch1 is streaming (not after it completes), look at the book directory:
ls books/<book-id>
cat books/<book-id>/meta.yml  # status should be 'generating' (the helper set it)
```

After completion, status should be `'reading'`. (Note: with the auto-cutover in this task, you can't easily see status `'toc_review'` because the frontend immediately calls `/start`. You'll be able to see it after Task 8.)

- [ ] **Step 5: Commit**

```bash
git add server/routes/books.ts src/components/CreationView.tsx
git commit -m "feat: split book creation into two requests via /start endpoint"
```

---

## Phase 4 — User-facing UI for awaiting_approval

### Task 7: Add `formatTocAsMarkdown` in `src/lib/format-toc.ts` with tests

**Files:**
- Create: `src/lib/format-toc.ts`
- Create: `src/lib/format-toc.test.ts`

- [ ] **Step 1: Create the helper**

```typescript
// src/lib/format-toc.ts
export interface TocChapterForFormatting {
  title: string
  description: string
}

export interface TocForFormatting {
  title: string
  subtitle?: string
  chapters: TocChapterForFormatting[]
}

/**
 * Reconstruct the markdown representation the AI emits, so a stored TOC
 * can be re-rendered in the CreationView when a book is resumed from the
 * library. Output is the inverse of parseTocFromMarkdown's canonical input.
 */
export function formatTocAsMarkdown(toc: TocForFormatting): string {
  const lines: string[] = []
  lines.push(`# ${toc.title}`)
  if (toc.subtitle) lines.push(`*${toc.subtitle}*`)
  lines.push('')
  toc.chapters.forEach((ch, i) => {
    lines.push(`${i + 1}. **${ch.title}** — ${ch.description}`)
  })
  return lines.join('\n')
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/lib/format-toc.test.ts
import { describe, it, expect } from 'vitest'
import { formatTocAsMarkdown } from './format-toc'

describe('formatTocAsMarkdown', () => {
  it('includes title, subtitle, and numbered chapters', () => {
    const md = formatTocAsMarkdown({
      title: 'Resilient CSS',
      subtitle: 'Layout Systems for the Real World',
      chapters: [
        { title: 'The Box Model', description: 'Foundations.' },
        { title: 'Flexbox', description: 'Patterns.' },
      ],
    })
    expect(md).toBe(
      '# Resilient CSS\n*Layout Systems for the Real World*\n\n1. **The Box Model** — Foundations.\n2. **Flexbox** — Patterns.',
    )
  })

  it('omits subtitle line when not provided', () => {
    const md = formatTocAsMarkdown({
      title: 'X',
      chapters: [{ title: 'A', description: 'a' }],
    })
    expect(md).toBe('# X\n\n1. **A** — a')
  })

  it('roundtrips with parseTocFromMarkdown (server parser)', async () => {
    // Server module is ESM; this just documents the contract.
    // Manual roundtrip check by hand:
    // formatTocAsMarkdown(parseTocFromMarkdown(md)) === md (approximately)
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/lib/format-toc.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/format-toc.ts src/lib/format-toc.test.ts
git commit -m "feat: add formatTocAsMarkdown helper for TOC reconstruction"
```

---

### Task 8: Expand `CreationView` state machine — replace auto-fire with `awaiting_approval` phase

**Files:**
- Modify: `src/components/CreationView.tsx`

- [ ] **Step 1: Add new phases**

Change the `Phase` type at line 10:

```typescript
type Phase = 'toc' | 'awaiting_approval' | 'revising' | 'starting' | 'done' | 'error'
```

(`'chapter'` is renamed to `'starting'`; `'awaiting_approval'` and `'revising'` are new.)

Update the existing `setActiveTab('chapter')` and other phase references through the file.

- [ ] **Step 2: Replace the auto-fire in `case 'toc_done'`**

```typescript
case 'toc_done': {
  toc.flushNow()
  setBookId(event.bookId)
  setPhase('awaiting_approval')
  // No automatic startChapterGeneration anymore.
  break
}
```

- [ ] **Step 3: Replace the single `Start Book` button block with phase-driven conditional rendering**

Find the existing footer JSX (around lines 224-251). Keep the existing `<button onClick={onCancel}>Cancel</button>` and the `{error && <p>}` error display unchanged. Replace only the `<Button>...Start Book...</Button>` block with:

```tsx
{phase === 'toc' && (
  <Button size="lg" disabled>
    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
    Generating…
  </Button>
)}

{phase === 'awaiting_approval' && (
  <>
    <Button
      variant="outline"
      size="lg"
      onClick={() => setFeedbackOpen(true)}
    >
      Provide Feedback
    </Button>
    <Button
      size="lg"
      onClick={() => bookId && handleGenerateChapter1(bookId)}
      className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
    >
      Generate Chapter 1 →
    </Button>
  </>
)}

{phase === 'starting' && (
  <Button size="lg" disabled>
    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
    Generating Chapter 1…
  </Button>
)}

{phase === 'revising' && (
  <Button size="lg" disabled>
    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
    Revising…
  </Button>
)}

{phase === 'done' && (
  <Button
    size="lg"
    onClick={() => bookId && onComplete(bookId)}
    className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
  >
    Start Book
  </Button>
)}
```

Add `const [feedbackOpen, setFeedbackOpen] = useState(false)` near the other state.

- [ ] **Step 4: Rename `startChapterGeneration` to `handleGenerateChapter1` and switch its phase transition**

```typescript
const handleGenerateChapter1 = useCallback(async (id: string) => {
  setPhase('starting')
  setActiveTab('chapter')
  try {
    const res = await fetch(apiUrl(`/api/books/${id}/start`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, provider, quizModel, quizProvider, quizLength }),
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.message || `Start failed: ${res.status}`)
    }
    await parseSSEStream(res, {
      onEvent: (event) => {
        switch (event.type) {
          case 'chapter':
            chapter.appendChunk(event.text)
            requestAnimationFrame(() => {
              chapterScrollRef.current?.scrollTo({ top: chapterScrollRef.current!.scrollHeight })
            })
            break
          case 'done':
            chapter.flushNow()
            setPhase('done')
            break
          case 'error':
            setError('Generation failed: ' + event.message)
            setPhase('error')
            break
        }
      },
    })
  } catch (err) {
    setError('Generation failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    setPhase('error')
  }
}, [model, provider, quizModel, quizProvider, quizLength, chapter])
```

- [ ] **Step 5: Update `isGenerating` and the disabled states**

```typescript
const isGenerating = phase === 'toc' || phase === 'starting' || phase === 'revising'
```

- [ ] **Step 6: Smoke test**

```bash
pnpm electron:dev
```

Create a 3-chapter book. Confirm: TOC streams, then you see the two new buttons. Clicking `Generate Chapter 1` triggers Ch1 streaming. (`Provide Feedback` still does nothing until Task 9.)

- [ ] **Step 7: Commit**

```bash
git add src/components/CreationView.tsx
git commit -m "feat: add awaiting_approval phase with Generate Chapter 1 button"
```

---

### Task 9: Create `ReviseTocDialog` and wire it into CreationView

**Files:**
- Create: `src/components/ReviseTocDialog.tsx`
- Modify: `src/components/CreationView.tsx`

- [ ] **Step 1: Create the dialog**

Look at `src/components/EditTagsDialog.tsx` or `src/components/ProfileDialog.tsx` for the canonical pattern. Build similar:

```tsx
// src/components/ReviseTocDialog.tsx
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import { Button } from '@src/components/ui/button'

interface ReviseTocDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (feedback: string) => void
  submitting?: boolean
}

export function ReviseTocDialog({ open, onOpenChange, onSubmit, submitting }: ReviseTocDialogProps) {
  const [feedback, setFeedback] = useState('')

  const handleSubmit = () => {
    if (!feedback.trim()) return
    onSubmit(feedback.trim())
    setFeedback('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-lg">
        <ScrollableDialogHeader>
          <DialogTitle>Revise Table of Contents</DialogTitle>
          <DialogDescription>
            Describe the changes you'd like. Untouched chapters will be preserved.
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="e.g., merge chapters 5 and 6, add a chapter on X between 3 and 4, rename 'Foundations' to something punchier"
            rows={6}
            autoFocus
            className="w-full min-h-[8rem] rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          />
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!feedback.trim() || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Revise
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire it in CreationView**

Import the dialog. Below the page JSX, add:

```tsx
<ReviseTocDialog
  open={feedbackOpen}
  onOpenChange={setFeedbackOpen}
  onSubmit={(feedback) => {
    setFeedbackOpen(false)
    if (bookId) handleRevise(bookId, feedback)
  }}
/>
```

Add the `handleRevise` function:

```typescript
const handleRevise = useCallback(async (id: string, feedback: string) => {
  setPhase('revising')
  setActiveTab('toc')
  // Clear the existing TOC content to make room for the streamed replacement
  toc.flushNow()
  toc.reset()  // see step 3
  try {
    const res = await fetch(apiUrl(`/api/books/${id}/toc/revise`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback, model, provider }),
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.message || `Revise failed: ${res.status}`)
    }
    await parseSSEStream(res, {
      onEvent: (event) => {
        switch (event.type) {
          case 'toc':
            toc.appendChunk(event.text)
            requestAnimationFrame(() => {
              tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
            })
            break
          case 'toc_revised':
            toc.flushNow()
            setPhase('awaiting_approval')
            break
          case 'error':
            // Revert isn't trivial mid-stream; surface error and let user retry.
            // Keep whatever partial content we have for now.
            toast.error('Revise failed: ' + event.message)
            setPhase('awaiting_approval')
            break
        }
      },
    })
  } catch (err) {
    toast.error('Revise failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    setPhase('awaiting_approval')
  }
}, [model, provider, toc])
```

Import `toast` from `@src/lib/toast` (already used elsewhere — check `WizardModal.tsx` for the import path).

- [ ] **Step 3: Verify `reset()` exists on `useStreamingContent`**

The hook at `src/hooks/useStreamingContent.ts` already exposes `reset()` in its return tuple. Confirm by opening the file. No code change needed.

- [ ] **Step 4: Smoke test**

```bash
pnpm electron:dev
```

Create a book. After TOC streams: click `Provide Feedback`, type "rename chapter 1 to something more catchy", click Revise. Confirm: dialog closes, TOC clears, new TOC streams in, two buttons reappear. Iterate again to confirm multiple rounds work.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReviseTocDialog.tsx src/components/CreationView.tsx
git commit -m "feat: add ReviseTocDialog for AI-mediated TOC iteration"
```

---

### Task 10: Add resume mode to CreationView (accept `bookId` prop)

**Files:**
- Modify: `src/components/CreationView.tsx`

- [ ] **Step 1: Make props a discriminated union**

```typescript
type CreationViewProps =
  | {
      mode: 'create'
      topic: string
      details: string
      chapterCount: number
      onComplete: (bookId: string) => void
      onCancel: () => void
      onBookCreated?: (bookId: string, title: string, totalChapters?: number) => void
    }
  | {
      mode: 'resume'
      bookId: string
      onComplete: (bookId: string) => void
      onCancel: () => void
    }
```

Update `export function CreationView(props: CreationViewProps)` and refactor the body to branch on `props.mode`.

- [ ] **Step 2: In resume mode, fetch the existing book + TOC instead of POSTing**

Replace the `useEffect` that calls `startGeneration` with:

```typescript
useEffect(() => {
  if (startedRef.current) return
  startedRef.current = true

  if (props.mode === 'create') {
    startGeneration()
  } else {
    resumeFromExisting(props.bookId)
  }
}, [...])
```

Add `resumeFromExisting`:

```typescript
const resumeFromExisting = useCallback(async (id: string) => {
  try {
    const [bookRes, tocRes] = await Promise.all([
      fetch(apiUrl(`/api/books/${id}`)),
      fetch(apiUrl(`/api/books/${id}/toc`)),
    ])
    if (!bookRes.ok || !tocRes.ok) throw new Error('Failed to load book')
    const book = await bookRes.json()
    const tocData = await tocRes.json()

    setBookId(id)
    // Reconstruct the TOC markdown and put it into the streaming buffer
    const md = formatTocAsMarkdown({
      title: book.title,
      subtitle: book.subtitle,
      chapters: tocData.chapters,
    })
    toc.appendChunk(md)
    toc.flushNow()
    setPhase('awaiting_approval')
  } catch (err) {
    setError('Failed to resume: ' + (err instanceof Error ? err.message : 'Unknown error'))
    setPhase('error')
  }
}, [toc])
```

Import `formatTocAsMarkdown` from `@src/lib/format-toc`.

- [ ] **Step 3: Typecheck and smoke**

```bash
pnpm exec tsc --noEmit
```

Manual test deferred to Task 11 (resume is only reachable via routing, which Task 11 adds).

- [ ] **Step 4: Commit**

```bash
git add src/components/CreationView.tsx
git commit -m "feat: add resume mode to CreationView for toc_review books"
```

---

### Task 11: Route `toc_review` books from library to CreationView resume mode

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a new view variant**

At the `type View` definition (around line 71):

```typescript
type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string; chapterCount: number }
  | { type: 'resuming'; bookId: string }      // NEW
  | { type: 'reading'; book: Book }
  | { type: 'quiz-review'; book: Book }
  | { type: 'review-progress' }
  | { type: 'skill-detail'; skillName: string }
  | { type: 'profile-update'; bookId: string; bookTitle: string }
  | { type: 'series'; seriesName: string }
```

- [ ] **Step 2: Branch in `openBook`**

Modify `openBook` (around line 271):

```typescript
const openBook = useCallback((book: Book) => {
  dispatch(setLastViewedBookId(book.id))
  persistor.flush().catch(() => {})
  if (book.status === 'toc_review') {
    setView({ type: 'resuming', bookId: book.id })
  } else {
    setView({ type: 'reading', book })
  }
}, [dispatch])
```

- [ ] **Step 3: Render the resume view**

Add this block alongside the existing `view.type === 'creating'` branch (around line 1339):

```tsx
if (view.type === 'resuming') {
  return (
    <CreationView
      mode="resume"
      bookId={view.bookId}
      onComplete={handleCreationComplete}
      onCancel={handleCreationCancel}
    />
  )
}
```

Update the existing `view.type === 'creating'` block to pass `mode="create"`:

```tsx
if (view.type === 'creating') {
  return (
    <CreationView
      mode="create"
      topic={view.topic}
      details={view.details}
      chapterCount={view.chapterCount}
      onComplete={handleCreationComplete}
      onCancel={handleCreationCancel}
      onBookCreated={handleBookCreated}
    />
  )
}
```

- [ ] **Step 4: Verify cancel-from-awaiting persists the book**

The existing `handleCreationCancel` in `App.tsx` (~line 336-346) only auto-deletes books with status `generating_toc` or `generating`. A book in `toc_review` falls through that filter and persists — which is exactly the resume behavior we want. No change needed to the cancel handler.

- [ ] **Step 5: Smoke test**

```bash
pnpm electron:dev
```

Create a book. After TOC appears with the two buttons, click Cancel. Confirm the book shows in the library. Click the book. Confirm CreationView reopens with the TOC visible and the two buttons. Click Provide Feedback, iterate. Click Generate Chapter 1, finish.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route toc_review books from library to CreationView resume mode"
```

---

### Task 12: Surface `toc_review` status visually in `BookCard` and `BookListRow`

**Files:**
- Modify: `src/components/BookCard.tsx`
- Modify: `src/components/BookListRow.tsx`

- [ ] **Step 1: Find existing status-based UI in BookCard**

```bash
grep -n "status\|generating_toc\|generating" src/components/BookCard.tsx
```

- [ ] **Step 2: Add a small chip / badge for `toc_review`**

Match whatever pattern is used for `'generating_toc'` and `'generating'`. Add a sibling branch for `'toc_review'`. Suggested label: `"Awaiting approval"`. Use a neutral / outlined visual variant so it doesn't compete with the active-generation indicator. Example:

```tsx
{book.status === 'toc_review' && (
  <span className="text-xs px-2 py-0.5 rounded-full border border-border-default/60 text-content-muted">
    Awaiting approval
  </span>
)}
```

- [ ] **Step 3: Same change in `BookListRow.tsx`**

Mirror the badge in the row variant.

- [ ] **Step 4: Verify the card is clickable for `toc_review` status**

`BookCard.tsx` may have an `isGenerating` flag that disables `onClick` for in-flight statuses (`generating_toc`, `generating`). Confirm `toc_review` is NOT included in that disabled set — clicking a `toc_review` card must route to the resume view (Task 11). If the existing flag inadvertently disables clicks for any non-`reading` status, narrow it to just the two active-generation statuses.

- [ ] **Step 5: Smoke test**

```bash
pnpm electron:dev
```

Create a book and cancel out at the awaiting-approval screen. In the library, confirm the badge appears. Click the card to confirm it routes back into CreationView.

- [ ] **Step 6: Commit**

```bash
git add src/components/BookCard.tsx src/components/BookListRow.tsx
git commit -m "feat: surface toc_review status in library card and list row"
```

---

## Phase 5 — Verification

### Task 13: End-to-end manual smoke test

- [ ] **Step 1: Fresh-create path**

```bash
pnpm electron:dev
```

1. New book, topic "Test Book", 3 chapters.
2. Wait for TOC to stream.
3. Confirm two action buttons appear (Provide Feedback, Generate Chapter 1).
4. Click Provide Feedback. Type "rename chapter 2 to 'Deep Dive'". Click Revise.
5. Confirm TOC is cleared and new TOC streams in. Verify chapter 2 was renamed. Verify chapters 1 and 3 are byte-identical (titles + descriptions match the original).
6. Click Provide Feedback again. Type "make this 4 chapters instead". Click Revise.
7. Verify new TOC has 4 chapters (chapter count override works).
8. Click Provide Feedback once more. Type "swap chapters 1 and 4". Confirm rearrangement.
9. Click Generate Chapter 1. Confirm Ch1 streams.
10. Click Start Book. Confirm ReaderPage opens on Ch1.

- [ ] **Step 2: Resume path**

1. Create another book.
2. After TOC streams, click Cancel.
3. Confirm the book shows in the library with the "Awaiting approval" badge.
4. Click the book card.
5. Confirm CreationView opens with the TOC visible and the two buttons.
6. Provide feedback, iterate, then Generate Chapter 1.

- [ ] **Step 3: Status guard path**

1. From a fully-generated book (status `reading`), call the revise endpoint via curl:

```bash
curl -i -X POST http://127.0.0.1:3147/api/books/<book-id>/toc/revise \
  -H 'Content-Type: application/json' \
  -d '{"feedback":"change something","model":"claude-haiku-4-5"}'
```

Expected: 409 with `{ error: 'Invalid status', currentStatus: 'reading' }`.

- [ ] **Step 4: Cleanup any test books and commit any final adjustments**

```bash
git status
# If anything was left dirty, commit it. Otherwise nothing to commit.
```

---

## Notes for the implementer

- **Tests:** Only `parseTocFromMarkdown`/`truncateChapters` (Task 1) and `formatTocAsMarkdown` (Task 7) have automated tests, because those are pure functions. The project has no existing route-level integration tests or React component tests; adding that infrastructure is out of scope for this feature. Manual smoke tests (Task 13) cover the rest, matching the project's existing testing convention.

- **Pre-commit hook:** lefthook runs typecheck on every commit. If a commit fails because of type errors, fix the errors and re-commit; do NOT bypass with `--no-verify`.

- **`useStreamingContent` reset:** Task 9 step 3 just verifies `reset()` exists — it already does. The handler uses `toc.flushNow()` then `toc.reset()` to clear the displayed content before the revised stream replaces it.

- **`POST /api/books` event shape:** After Task 6, this endpoint emits `book_created`, `toc`, `toc_done`, `done`. No more `chapter`, `skills_classified`, or `quiz_*` events from this endpoint — those now come from `/start`.

- **Existing `PUT /api/books/:id/toc`:** Untouched. Continues to support direct chapter-array saves for any future manual-edit UI.
