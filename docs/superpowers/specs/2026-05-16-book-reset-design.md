# Book Reset: Wipe Reader Interaction, Preserve Generated Content

## Context

Today, once a user reads chapters, rates a book, leaves feedback, or answers quizzes, that interaction history is permanent — there is no way to start the book over without deleting it and regenerating from scratch. Regenerating is expensive (multiple AI calls for TOC + chapters) and loses content the user may want to keep.

This design adds a **Reset** action to the book context menu (both grid and list views). Reset wipes the user's interaction history for one book — read progress, rating, per-chapter feedback, per-chapter and final quiz answers, final quiz score — while leaving the generated TOC, chapters, cover, and EPUB intact. The book becomes available to read again from chapter 1 as if freshly generated.

The action sits in the Danger group of the existing context menu (above Delete) and is gated by a type-to-confirm dialog mirroring Delete's pattern.

## Design Decisions

- **Reset preserves generated content; wipes only user interaction.** Chapters, TOC, cover, and EPUB are kept. The user does not pay to regenerate work the AI already did. This matches the literal wording "as if it hadn't been read before, hadn't rated, and none of the quizzes had been done."
- **Per-chapter quiz questions are preserved; only `userAnswer` and `correct` are stripped from each question.** The questions exist in `quiz/*.yml` files; only the user-attempt fields are cleared. Same applies to `final-quiz.yml`. The trade-off accepted: same questions appear on re-read. Benefit: zero LLM calls during reset.
- **Per-chapter feedback files (`feedback/*.yml`) are deleted outright.** Feedback files represent a single user attempt and have no questions/structure to preserve — they are conceptually wholly user-generated.
- **`progress.yml` is deleted, not zeroed.** A missing file is the same as a fresh book's state (`getProgress` already returns `{ chapters: {} }` when absent). Simpler and matches the existing data contract.
- **`status` is set to `'reading'`, not a new enum value.** `'reading'` already means "chapters exist, book is available." The UI's `classifyBook` helper (`App.tsx:624`) derives "not-started" from `status !== 'complete' && no reading position`, so a reset book automatically classifies as "not-started" across the library without any schema or UI changes.
- **`rating`, `finalQuizScore`, `finalQuizTotal` are removed from `meta.yml` (set to undefined).** These are optional fields in `BookMetaSchema`; absent is the correct "never rated" state.
- **`generatedUpTo` is preserved.** Chapters are kept, so generation state is unchanged.
- **No transactional atomicity across files.** Each filesystem operation is independent; `resetBook` is idempotent (re-running converges to the same end state). A mid-reset crash leaves the book in a partially-reset state that completes correctly on a retry. Acceptable for a local single-user app — building a real transaction layer is over-engineering.
- **Reset is server-rejected during generation.** If `status === 'generating' || 'generating_toc'`, the endpoint returns 409. The UI context menu is already disabled in those states (`BookCard.tsx:34`), so the server check is belt-and-suspenders against stale clients. Background "Generate All" tasks are not affected — they write to `chapters/*.md` (kept) and `quiz/*.yml` (kept), so a reset during a background generation is safe and the in-flight task continues.
- **Type-to-confirm friction.** The user must type `reset` to enable the confirm button, mirroring the existing Delete dialog (`App.tsx:1183`). Reset is irreversible for the user's interaction history.
- **Single endpoint, single store function.** `POST /api/books/:id/reset` calls `store.resetBook(id)`. No granular reset variants — YAGNI.

## Architecture Overview

### Data Contract: What Reset Touches

| Path | Action | Reason |
|------|--------|--------|
| `books/{id}/chapters/*.md` | Keep | Generated content; expensive to recreate |
| `books/{id}/toc.yml` | Keep | Generated content |
| `books/{id}/cover.{png,jpg,webp}` | Keep | Generated/uploaded content |
| `books/{id}/book.epub` | Keep | Derived export, but valid against retained chapters |
| `books/{id}/meta.yml` → `title`, `subtitle`, `prompt`, `totalChapters`, `generatedUpTo`, `tags`, `series`, `seriesOrder`, `sortOrder`, `showTitleOnCover`, `imported`, `createdAt`, `profileOverrides` | Keep | Identity + generation state |
| `books/{id}/meta.yml` → `status` | Set to `'reading'` | Chapters exist, book is available |
| `books/{id}/meta.yml` → `updatedAt` | Set to `new Date().toISOString()` | Reflects the reset event |
| `books/{id}/meta.yml` → `rating` | Remove (set to undefined) | User interaction |
| `books/{id}/meta.yml` → `finalQuizScore` | Remove | User interaction |
| `books/{id}/meta.yml` → `finalQuizTotal` | Remove | User interaction |
| `books/{id}/progress.yml` | Delete file | User interaction; missing == fresh |
| `books/{id}/feedback/*.yml` | Delete each file | User interaction, no preservable structure |
| `books/{id}/quiz/*.yml` (per question) | Strip `userAnswer` and `correct`; keep `question`, `options`, `correctIndex` | Questions are LLM output worth preserving; answers are user-only |
| `books/{id}/final-quiz.yml` (per question) | Strip `userAnswer` and `correct` | Same as per-chapter quizzes |

### Status Transitions

```
reading   ──reset──> reading
complete  ──reset──> reading
failed    ──reset──> reading       (recovery path for half-built books with prior reads)
toc_review ──reset──> toc_review    (no-op effectively; progress/feedback don't exist yet)
generating, generating_toc        ── reset REJECTED (409)
```

`failed` and `toc_review` are reachable through this endpoint but the action is mostly a no-op in those states — there is nothing for a user to have interacted with. It still succeeds (idempotent), which matches the principle that reset converges to the same end state regardless of starting state.

### Backend

**New store function in `server/services/book-store.ts`:**

```ts
export async function resetBook(bookId: string): Promise<void> {
  const meta = await getBook(bookId)
  if (meta.status === 'generating' || meta.status === 'generating_toc') {
    throw new Error('Cannot reset book while it is generating')
  }

  const dir = bookDir(bookId)

  // Delete progress.yml
  const progressPath = join(dir, 'progress.yml')
  if (existsSync(progressPath)) await rm(progressPath)

  // Delete all feedback/*.yml
  const feedbackDir = join(dir, 'feedback')
  if (existsSync(feedbackDir)) {
    for (const file of await readdir(feedbackDir)) {
      if (file.endsWith('.yml')) await rm(join(feedbackDir, file))
    }
  }

  // Strip user-attempt fields from per-chapter quizzes
  const quizDir = join(dir, 'quiz')
  if (existsSync(quizDir)) {
    for (const file of await readdir(quizDir)) {
      if (!file.endsWith('.yml')) continue
      const path = join(quizDir, file)
      const quiz = await readYaml(path, QuizSchema)
      await writeYaml(path, stripUserAnswers(quiz))
    }
  }

  // Strip user-attempt fields from final quiz
  const finalQuizPath = join(dir, 'final-quiz.yml')
  if (existsSync(finalQuizPath)) {
    const finalQuiz = await readYaml(finalQuizPath, QuizSchema)
    await writeYaml(finalQuizPath, stripUserAnswers(finalQuiz))
  }

  // Reset meta fields
  const { rating: _r, finalQuizScore: _s, finalQuizTotal: _t, ...rest } = meta
  await saveBook({
    ...rest,
    status: 'reading',
    updatedAt: new Date().toISOString(),
  })
}

function stripUserAnswers(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map(({ userAnswer: _u, correct: _c, ...rest }) => rest),
  }
}
```

`readdir` is imported from `node:fs/promises` (already used elsewhere in this file via `rm`, `mkdir`, `rename`).

**New endpoint in `server/routes/books.ts`:**

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

The store function and endpoint both guard against generating states. The store function is the authoritative gate; the endpoint check is for early-return + meaningful HTTP status.

### Frontend

State (`App.tsx`, adjacent to `deleteDialog` at line 89):

```ts
const [resetDialog, setResetDialog] = useState<{ book: Book; input: string } | null>(null)
```

Handler (`App.tsx`, adjacent to `handleDelete` at line 477):

```ts
const handleReset = async () => {
  if (!resetDialog || resetDialog.input !== 'reset') return
  setMutating(true)
  try {
    const res = await fetch(apiUrl(`/api/books/${resetDialog.book.id}/reset`), {
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to reset')
    await fetchBooks()
  } catch (err) {
    // existing error toast pattern
  } finally {
    setMutating(false)
  }
  setResetDialog(null)
}
```

Context menu item (`App.tsx`, `renderContextMenu()` Danger group at line 1071, inserted directly above the Delete button):

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

Icon: `RotateCcw` from `lucide-react`.

Confirmation dialog (`App.tsx`, adjacent to the delete dialog at line 1183):

```tsx
<Dialog open={!!resetDialog} onOpenChange={open => { if (!open) setResetDialog(null) }}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader>
      <DialogTitle>Reset Book</DialogTitle>
      <DialogDescription>
        Are you sure you want to reset &ldquo;{resetDialog?.book.title}&rdquo;?
        This permanently clears your reading progress, rating, feedback, and quiz answers.
        The chapters and table of contents will remain. Type <strong>reset</strong> to confirm.
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

Mirrors the Delete dialog at `App.tsx:1183` exactly: raw `<input>` with the same Tailwind classes, `sm:max-w-sm` content width, "OK" confirm label.

Both `BookCard` and `BookListRow` already accept `onContextMenu` (`BookCard.tsx:24`, `BookListRow.tsx:31`) and disable it when status is `generating`/`generating_toc`. No component changes required — the new menu item flows through the existing `onContextMenu` handler in `App.tsx:1416`.

### Post-Reset UI Behavior (Falls Out For Free)

After reset, the next `fetchBooks()` returns the updated book with `chaptersRead: 0`, no `rating`, no `finalQuizScore`. The existing UI logic then:

- `BookCard.tsx:107` — progress bar disappears (`progress === 0`)
- `BookCard.tsx:120-123` — meta line shows `"N chapters"` instead of `"X of N chapters"`
- `BookCard.tsx:125` — star rating disappears
- `BookListRow.tsx:101-110` — progress bar empties, count shows `0/N`
- `BookListRow.tsx:121-127` — rating column shows `--`
- `App.tsx:624` — `classifyBook` returns `'not-started'`, so library filters/sorts treat the book as fresh

### API Contract

| Method | Path | Body | Success | Error |
|--------|------|------|---------|-------|
| `POST` | `/api/books/:id/reset` | none | `{ ok: true }` (200) | `{ error: string }` (404 if book missing, 409 if generating, 500 on filesystem error) |

The endpoint table in `CLAUDE.md` will need a row added.

## Testing

### Server tests (`server/services/book-store.test.ts`)

1. **Clears user-interaction files.** After a `resetBook`: `progress.yml` is absent, `feedback/` directory exists but contains no `*.yml` files (the directory itself remains because `saveBook` re-creates it at `book-store.ts:126`), per-chapter `quiz/*.yml` files exist but each question has no `userAnswer` or `correct`, `final-quiz.yml` exists but its questions have no `userAnswer` or `correct`.
2. **Preserves generated content.** After a `resetBook`: `chapters/*.md` files unchanged, `toc.yml` unchanged, cover file (if any) unchanged.
3. **Resets meta fields.** After a `resetBook`: `meta.status === 'reading'`, `meta.rating === undefined`, `meta.finalQuizScore === undefined`, `meta.finalQuizTotal === undefined`, `meta.updatedAt` is newer than before. All other meta fields (`title`, `subtitle`, `prompt`, `totalChapters`, `generatedUpTo`, `tags`, `series`, `seriesOrder`, `sortOrder`, `showTitleOnCover`, `imported`, `createdAt`, `profileOverrides`) unchanged.
4. **Idempotent.** Running `resetBook` twice in sequence produces the same end state as one call.
5. **No-op on fresh book.** Calling `resetBook` on a book that has no `progress.yml`, no `feedback/`, no quizzes, no rating succeeds and leaves the book valid.
6. **Rejects during generation.** `resetBook` throws when `meta.status === 'generating'` or `'generating_toc'`.

### Manual UI verification

After the implementation lands:

1. Open a book, read partway, leave feedback, answer a quiz, rate the book.
2. Return to library, right-click the book, click Reset.
3. Confirmation dialog appears; typing anything other than `reset` keeps the button disabled.
4. Type `reset`, click confirm.
5. Library re-renders: book shows `N chapters` (not `X of N`), no rating stars, no progress bar.
6. Open the book — start at chapter 1, no prior progress, prior quiz attempts gone (but same questions still present on the quiz screen).
7. Verify the same flow works from the list-view right-click.
8. Attempt reset while a "Generate All" is mid-flight: menu item is disabled (card greyed); if forced via API, server returns 409.

## Out of Scope

- Bulk reset across multiple selected books. Single-book only for now.
- Undo / reset history. Once confirmed, the user's interaction data is gone.
- Resetting the global learning profile or skill progress. Reset is scoped to one book; cross-book aggregates (skill progression) recompute naturally from remaining feedback.
- Re-running TOC or chapter regeneration. Use Delete + recreate for that.
- Keyboard shortcut for reset. Not requested, can be added later.
