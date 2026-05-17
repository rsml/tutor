# Book Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reset action to the book context menu that wipes the user's interaction history (read progress, rating, feedback, quiz answers) while preserving generated content (chapters, TOC, cover, EPUB).

**Architecture:** New `resetBook(bookId)` store function in `book-store.ts` performs filesystem mutations (delete `progress.yml`, delete `feedback/*.yml`, strip `userAnswer`/`correct` from quiz and final-quiz YAML files, clear `rating`/`finalQuizScore`/`finalQuizTotal` from `meta.yml`, set status to `'reading'`). A new `POST /api/books/:id/reset` endpoint exposes it, guarded against active generation. The React frontend adds a "Reset" item to the existing Danger group of the context menu in `App.tsx` and mirrors the Delete-dialog type-to-confirm pattern.

**Tech Stack:** TypeScript, Vitest, Fastify, React 19, shadcn/ui Dialog, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-16-book-reset-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server/services/book-store.ts` | Adds `resetBook(bookId)` and a private `stripUserAnswers(quiz)` helper |
| `server/services/book-store.test.ts` | Adds a `describe('reset')` block with six tests |
| `server/routes/books.ts` | Adds `POST /api/books/:id/reset` endpoint |
| `src/App.tsx` | Adds `resetDialog` state, `handleReset` action, context menu item (Danger group, above Delete), confirmation dialog (mirrors Delete pattern) |
| `CLAUDE.md` | Adds a row to the API Routes table |

No new files. Only existing files are modified. All changes follow the patterns established by Delete (state, handler, menu item, dialog).

---

## Chunk 1: Server — `resetBook` store function

### Task 1: Add `resetBook` store function with TDD

**Files:**
- Modify: `server/services/book-store.ts`
- Modify: `server/services/book-store.test.ts`

The function deletes `progress.yml`, deletes all `feedback/*.yml`, strips user-answer fields from `quiz/*.yml` and `final-quiz.yml`, and updates `meta.yml` (status='reading', remove rating/finalQuizScore/finalQuizTotal, refresh updatedAt). It rejects when the book is mid-generation. It is idempotent.

#### Step 1: Write failing tests (all six)

Append this block to `server/services/book-store.test.ts` directly before the closing `})` of the outermost `describe('book-store', () => {` block (after the `describe('validation', ...)` block):

- [ ] **Step 1: Add the test block**

```ts
  describe('reset', () => {
    const testFeedback: Feedback = {
      chapter: 1,
      feedback: { liked: 'Great', disliked: 'Too dense' },
      quiz: {
        questions: [
          { question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, userAnswer: 1, correct: false },
          { question: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 2, userAnswer: 2, correct: true },
        ],
        score: 1,
      },
    }

    const testQuiz: Quiz = {
      questions: [
        { question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, userAnswer: 3, correct: false },
        { question: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, userAnswer: 1, correct: true },
      ],
    }

    // Seed a book with chapters, TOC, progress, feedback, per-chapter quiz,
    // final quiz, and full meta (rating + final-quiz score).
    async function seedReadBook(): Promise<BookMeta> {
      const meta: BookMeta = {
        ...testMeta,
        status: 'complete',
        rating: 4.5,
        finalQuizScore: 8,
        finalQuizTotal: 10,
      }
      await store.saveBook(meta)
      await store.saveToc(meta.id, testToc)
      await store.saveChapter(meta.id, 1, '# Chapter 1\n\nBody')
      await store.saveChapter(meta.id, 2, '# Chapter 2\n\nBody')
      await store.saveChapterProgress(meta.id, 1, { scroll: 1, completed: true, completedAt: '2026-05-01T00:00:00Z' })
      await store.saveChapterProgress(meta.id, 2, { scroll: 0.5, completed: false })
      await store.saveFeedback(meta.id, 1, testFeedback)
      await store.saveFeedback(meta.id, 2, { ...testFeedback, chapter: 2 })
      await store.saveQuiz(meta.id, 1, testQuiz)
      await store.saveQuiz(meta.id, 2, testQuiz)
      await store.saveFinalQuiz(meta.id, testQuiz)
      return meta
    }

    it('clears user-interaction files', async () => {
      const meta = await seedReadBook()
      await store.resetBook(meta.id)

      // progress.yml is gone
      const progress = await store.getProgress(meta.id)
      expect(progress.chapters).toEqual({})

      // feedback files are gone
      const allFeedback = await store.getAllFeedback(meta.id)
      expect(allFeedback).toEqual([])

      // per-chapter quiz files exist; userAnswer/correct stripped
      const q1 = await store.getQuiz(meta.id, 1)
      expect(q1.questions).toHaveLength(2)
      for (const q of q1.questions) {
        expect(q).not.toHaveProperty('userAnswer')
        expect(q).not.toHaveProperty('correct')
        expect(q.question).toBeTruthy()
        expect(q.options).toHaveLength(4)
        expect(typeof q.correctIndex).toBe('number')
      }
      const q2 = await store.getQuiz(meta.id, 2)
      expect(q2.questions).toHaveLength(2)

      // final quiz exists; userAnswer/correct stripped
      const fq = await store.getFinalQuiz(meta.id)
      expect(fq.questions).toHaveLength(2)
      for (const q of fq.questions) {
        expect(q).not.toHaveProperty('userAnswer')
        expect(q).not.toHaveProperty('correct')
      }
    })

    it('preserves generated content', async () => {
      const meta = await seedReadBook()
      await store.resetBook(meta.id)

      // chapters stay
      const ch1 = await store.getChapter(meta.id, 1)
      expect(ch1).toContain('# Chapter 1')
      const ch2 = await store.getChapter(meta.id, 2)
      expect(ch2).toContain('# Chapter 2')

      // TOC stays
      const toc = await store.getToc(meta.id)
      expect(toc.chapters).toHaveLength(3)
    })

    it('resets meta fields', async () => {
      const meta = await seedReadBook()
      const before = meta.updatedAt
      await store.resetBook(meta.id)
      const after = await store.getBook(meta.id)

      expect(after.status).toBe('reading')
      expect(after.rating).toBeUndefined()
      expect(after.finalQuizScore).toBeUndefined()
      expect(after.finalQuizTotal).toBeUndefined()
      expect(after.updatedAt > before).toBe(true)

      // Preserved meta fields
      expect(after.id).toBe(meta.id)
      expect(after.title).toBe(meta.title)
      expect(after.prompt).toBe(meta.prompt)
      expect(after.totalChapters).toBe(meta.totalChapters)
      expect(after.generatedUpTo).toBe(meta.generatedUpTo)
      expect(after.createdAt).toBe(meta.createdAt)
    })

    it('is idempotent', async () => {
      const meta = await seedReadBook()
      await store.resetBook(meta.id)
      const firstReset = await store.getBook(meta.id)
      // Second reset on an already-reset book should not throw and should
      // leave the book in the same shape (modulo updatedAt).
      await store.resetBook(meta.id)
      const secondReset = await store.getBook(meta.id)

      expect(secondReset.status).toBe('reading')
      expect(secondReset.rating).toBeUndefined()
      expect(secondReset.finalQuizScore).toBeUndefined()
      expect(secondReset.finalQuizTotal).toBeUndefined()

      const progress = await store.getProgress(meta.id)
      expect(progress.chapters).toEqual({})
      const allFeedback = await store.getAllFeedback(meta.id)
      expect(allFeedback).toEqual([])

      // updatedAt monotonically increases (or is at least not earlier)
      expect(secondReset.updatedAt >= firstReset.updatedAt).toBe(true)
    })

    it('is a no-op on a fresh book without progress/feedback/quizzes', async () => {
      const meta: BookMeta = { ...testMeta, status: 'reading' }
      await store.saveBook(meta)
      await store.saveToc(meta.id, testToc)
      await store.saveChapter(meta.id, 1, '# Chapter 1')

      await expect(store.resetBook(meta.id)).resolves.not.toThrow()

      const after = await store.getBook(meta.id)
      expect(after.status).toBe('reading')
      expect(after.rating).toBeUndefined()
      const ch = await store.getChapter(meta.id, 1)
      expect(ch).toContain('# Chapter 1')
    })

    it('rejects when status is generating', async () => {
      const meta: BookMeta = { ...testMeta, status: 'generating' }
      await store.saveBook(meta)
      await expect(store.resetBook(meta.id)).rejects.toThrow(/generating/)
    })

    it('rejects when status is generating_toc', async () => {
      const meta: BookMeta = { ...testMeta, status: 'generating_toc' }
      await store.saveBook(meta)
      await expect(store.resetBook(meta.id)).rejects.toThrow(/generating/)
    })
  })
```

Also add `Quiz` to the imports at the top of the file:

Change `server/services/book-store.test.ts:7` from:
```ts
import type { BookMeta, Feedback, LearningProfile, Toc } from '../schemas.js'
```
to:
```ts
import type { BookMeta, Feedback, LearningProfile, Quiz, Toc } from '../schemas.js'
```

- [ ] **Step 2: Run tests, verify they all fail with "resetBook is not a function"**

```bash
pnpm vitest run server/services/book-store.test.ts -t reset
```

Expected: 7 failures (the `seedReadBook` helper is fine; each `it(...)` call hits `store.resetBook` which doesn't exist yet).

- [ ] **Step 3: Add `resetBook` and `stripUserAnswers` to `server/services/book-store.ts`**

Insert this block in `server/services/book-store.ts` immediately after `deleteBook` (after the closing `}` at line 139, before the `// --- Table of Contents ---` comment):

```ts
// --- Reset ---

function stripUserAnswers(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map(({ userAnswer: _u, correct: _c, ...rest }) => rest),
  }
}

export async function resetBook(bookId: string): Promise<void> {
  const meta = await getBook(bookId)
  if (meta.status === 'generating' || meta.status === 'generating_toc') {
    throw new Error(`Cannot reset book "${bookId}" while it is generating`)
  }

  const dir = bookDir(bookId)

  // Delete progress.yml
  const progressPath = join(dir, 'progress.yml')
  if (existsSync(progressPath)) await rm(progressPath)

  // Delete every feedback/*.yml file (keep the directory itself; saveBook re-creates it)
  const feedbackDir = join(dir, 'feedback')
  if (existsSync(feedbackDir)) {
    for (const file of await readdir(feedbackDir)) {
      if (file.endsWith('.yml')) await rm(join(feedbackDir, file))
    }
  }

  // Strip userAnswer/correct from per-chapter quiz files (keep the questions)
  const quizDir = join(dir, 'quiz')
  if (existsSync(quizDir)) {
    for (const file of await readdir(quizDir)) {
      if (!file.endsWith('.yml')) continue
      const path = join(quizDir, file)
      const quiz = await readYaml(path, QuizSchema)
      await writeYaml(path, stripUserAnswers(quiz))
    }
  }

  // Strip userAnswer/correct from final-quiz.yml (keep the questions)
  const finalQuizPath = join(dir, 'final-quiz.yml')
  if (existsSync(finalQuizPath)) {
    const finalQuiz = await readYaml(finalQuizPath, QuizSchema)
    await writeYaml(finalQuizPath, stripUserAnswers(finalQuiz))
  }

  // Reset meta: drop rating/finalQuiz* fields, set status to 'reading', refresh updatedAt
  const { rating: _r, finalQuizScore: _s, finalQuizTotal: _t, ...rest } = meta
  await saveBook({
    ...rest,
    status: 'reading',
    updatedAt: new Date().toISOString(),
  })
}
```

`readdir`, `rm`, `join`, `existsSync` are all already imported at the top of the file (`server/services/book-store.ts:1-3`). `QuizSchema`, `Quiz`, `getBook`, `saveBook`, `bookDir`, `readYaml`, `writeYaml` are all defined or imported in the same file.

- [ ] **Step 4: Run tests, verify all 7 pass**

```bash
pnpm vitest run server/services/book-store.test.ts -t reset
```

Expected: 7 passes, 0 failures.

- [ ] **Step 5: Run the whole test suite to confirm nothing else broke**

```bash
pnpm test
```

Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add server/services/book-store.ts server/services/book-store.test.ts
git commit -m "Add resetBook to book-store

Wipes per-book user interaction (progress, feedback, quiz answers,
rating, final-quiz score) while preserving chapters, TOC, and quiz
questions. Idempotent. Rejects during active generation."
```

---

## Chunk 2: Server — Reset endpoint

### Task 2: Add `POST /api/books/:id/reset` endpoint

**Files:**
- Modify: `server/routes/books.ts`

Add the endpoint adjacent to the existing `DELETE /api/books/:id` route at `server/routes/books.ts:595-598`.

- [ ] **Step 1: Add the endpoint**

Insert this block in `server/routes/books.ts` immediately after the closing `})` of the `DELETE /api/books/:id` handler at line 598:

```ts
  fastify.post<{ Params: { id: string } }>(
    '/api/books/:id/reset',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const meta = await store.getBook(request.params.id)
      if (meta.status === 'generating' || meta.status === 'generating_toc') {
        return reply.code(409).send({ error: 'Cannot reset while generating' })
      }
      await store.resetBook(request.params.id)
      return { ok: true }
    },
  )
```

- [ ] **Step 2: Manually verify the endpoint works against a real running server**

In one terminal:

```bash
pnpm dev:server
```

In another terminal:

```bash
# Create a fake book by hand on disk, OR (easier) start an actual book from the UI,
# read a chapter, leave feedback. Then:

curl -X POST http://127.0.0.1:3147/api/books/<some-book-id>/reset
# Expected: {"ok":true}

# Verify on disk:
ls books/<some-book-id>/
# progress.yml should be gone; feedback/ should be empty; quiz/*.yml should
# contain questions without userAnswer/correct; meta.yml status should be 'reading'
# and rating/finalQuizScore/finalQuizTotal should be absent.

# Try resetting a book in 'generating' state (manually edit meta.yml status first):
curl -X POST http://127.0.0.1:3147/api/books/<some-book-id>/reset
# Expected: 409 with {"error":"Cannot reset while generating"}
```

- [ ] **Step 3: Run the whole test suite**

```bash
pnpm test
```

Expected: full suite passes (no new tests added in this task; we rely on the store-level tests in Task 1).

- [ ] **Step 4: Commit**

```bash
git add server/routes/books.ts
git commit -m "Add POST /api/books/:id/reset endpoint

Returns 409 if the book is mid-generation; otherwise delegates to
store.resetBook and returns {ok:true}."
```

---

## Chunk 3: Frontend — Reset action

### Task 3: Add reset state, handler, menu item, and dialog

**Files:**
- Modify: `src/App.tsx`

This task is one logical unit (state + handler + menu button + dialog all together). Splitting it would force the intermediate commits to compile but be visibly broken (e.g., menu item with no dialog).

- [ ] **Step 1: Add `RotateCcw` to lucide-react imports**

Change `src/App.tsx:3` from:
```ts
import { Plus, BookOpen, X, FileDown, Pencil, Star, Tags, Library, ClipboardCheck, Eye, Image, Zap, Download, Trash2 } from 'lucide-react'
```
to:
```ts
import { Plus, BookOpen, X, FileDown, Pencil, Star, Tags, Library, ClipboardCheck, Eye, Image, Zap, Download, Trash2, RotateCcw } from 'lucide-react'
```

- [ ] **Step 2: Add the `resetDialog` state declaration**

Insert this line in `src/App.tsx` immediately after the `deleteDialog` declaration at line 89:

```ts
  const [resetDialog, setResetDialog] = useState<{ book: Book; input: string } | null>(null)
```

So lines 89-90 become:

```ts
  const [deleteDialog, setDeleteDialog] = useState<{ book: Book; input: string } | null>(null)
  const [resetDialog, setResetDialog] = useState<{ book: Book; input: string } | null>(null)
```

- [ ] **Step 3: Add the `handleReset` function**

Insert this block in `src/App.tsx` immediately after the closing `}` of `handleDelete` at line 492 (before the `handleSaveTags` declaration):

```ts
  const handleReset = async () => {
    if (!resetDialog || resetDialog.input !== 'reset') return
    setMutating(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${resetDialog.book.id}/reset`), {
        method: 'POST',
      })
      if (res.ok) await fetchBooks()
      else toast.error('Failed to reset book')
    } catch {
      toast.error('Failed to reset book — server unreachable')
    } finally {
      setMutating(false)
    }
    setResetDialog(null)
  }
```

- [ ] **Step 4: Add the Reset context-menu item**

Insert this block in `src/App.tsx` immediately before the existing Delete button in `renderContextMenu()`. The Delete button starts at line 1073 (after the `<div className="my-1 h-px bg-border-default/50" />` Danger separator at line 1071). Insert the new button **between** the separator and the Delete button:

```tsx
      <button
        onClick={() => {
          setResetDialog({ book: contextMenu.book, input: '' })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <RotateCcw className="size-3.5 shrink-0" />
        Reset
      </button>
```

After the edit, the Danger group should read:

```tsx
      <div className="my-1 h-px bg-border-default/50" />
      {/* Danger group */}
      <button
        onClick={() => {
          setResetDialog({ book: contextMenu.book, input: '' })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <RotateCcw className="size-3.5 shrink-0" />
        Reset
      </button>
      <button
        onClick={() => {
          setDeleteDialog({ book: contextMenu.book, input: '' })
          setContextMenu(null)
        }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Trash2 className="size-3.5 shrink-0" />
        Delete
      </button>
```

- [ ] **Step 5: Add the Reset confirmation dialog**

Insert this block in `src/App.tsx` immediately after the closing `</Dialog>` of the Delete dialog at line 1204 (before the Rate dialog comment on line 1206):

```tsx
      <Dialog open={!!resetDialog} onOpenChange={open => { if (!open) setResetDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset &ldquo;{resetDialog?.book.title}&rdquo;? This permanently clears your reading progress, rating, feedback, and quiz answers. The chapters and table of contents will remain. Type <strong>reset</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            value={resetDialog?.input ?? ''}
            onChange={e => setResetDialog(prev => prev ? { ...prev, input: e.target.value } : null)}
            onKeyDown={e => e.key === 'Enter' && resetDialog?.input === 'reset' && handleReset()}
            placeholder="reset"
            className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetDialog?.input !== 'reset' || mutating}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run tests (no client tests touched, but confirm nothing broke)**

```bash
pnpm test
```

Expected: full suite passes.

- [ ] **Step 8: Manually verify the UI flow in dev mode**

```bash
pnpm electron:dev
```

In the running app:
1. Create or open a book that has been partially read with feedback and quiz answers.
2. Right-click the book in the library (grid view). Expect "Reset" to appear in red above "Delete".
3. Click Reset. Confirmation dialog appears with the book title in the prompt.
4. Type anything other than `reset` — the OK button stays disabled.
5. Type `reset` — OK button becomes enabled.
6. Press Enter (or click OK). Dialog closes; library re-renders. The book card now shows `N chapters` (not `X of N`), no progress bar, no rating stars.
7. Open the book — chapter 1 is positioned at the top, no prior progress, quiz attempts gone (but same questions still on the quiz screen).
8. Switch to list view (if the UI supports it). Right-click a book row. Verify Reset is in the context menu there too and works identically.
9. While a "Generate All" task is running on a book, verify right-clicking the card is disabled entirely (existing behavior — Reset is unreachable mid-generation by design).

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "Add Reset action to book context menu

Mirrors the Delete pattern: state, handler, Danger-group menu item
(red, above Delete), and type-to-confirm dialog (\"reset\"). Calls
POST /api/books/:id/reset and refetches books on success."
```

---

## Chunk 4: Docs — CLAUDE.md endpoint table

### Task 4: Document the new endpoint

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a row to the API Routes table**

Find the API Routes table in `CLAUDE.md` (it starts with `| Method | Path | Purpose |`). Insert this row immediately after the `DELETE /api/books/:id` row:

```markdown
| `POST` | `/api/books/:id/reset` | Reset reader interaction (progress, rating, feedback, quiz answers) |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document /api/books/:id/reset in API table"
```

---

## Final Verification

- [ ] **Run full test suite once more from a clean state**

```bash
pnpm test
```

Expected: every test passes.

- [ ] **Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Smoke-test in dev mode once more end-to-end**

```bash
pnpm electron:dev
```

Repeat the Task 3 Step 8 manual UI verification on a real book.

---

## Out of Scope (per spec)

- Bulk reset across multiple selected books.
- Undo / reset history.
- Resetting the global learning profile or skill progress.
- Keyboard shortcut for Reset.
- Regenerating quiz questions on reset (we strip user attempts but keep questions).
