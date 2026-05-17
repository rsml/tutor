# TOC Revision Before Chapter 1: Pause, Feedback, Iterate

## Context

`POST /api/books` is currently a single streaming request that generates the table of contents, classifies skills, generates Chapter 1, and generates the Chapter 1 quiz — all in sequence with no user checkpoint. The user has no opportunity to course-correct the TOC after seeing it but before Chapter 1 is written from it.

This design splits that monolithic flow at the TOC boundary. After the TOC streams, the book enters the `toc_review` state and waits. The user can either approve the TOC (which kicks off skill classification + Chapter 1 + quiz) or open a feedback modal to request targeted revisions. Revisions stream a new TOC in place, the user can iterate as many times as they like, and the book is resumable from the library if they walk away.

Once Chapter 1 has been generated, the TOC is locked — revising it then would create inconsistencies between written chapter content and what the TOC claims the chapter is about.

## Design Decisions

- **Three-endpoint split** of the current monolithic `POST /api/books`: TOC-only creation, AI-mediated revise, explicit start. Each has a single responsibility and is independently retryable.
- **`toc_review` is the persisted status** for "TOC done, awaiting user approval." This literal already exists in `BookStatusSchema` but is currently dormant (no code path sets or reads it). This design activates it. State lives on the book, not session-only — closing the wizard mid-approval drops the user back in the library; clicking the book resumes the approval view.
- **Skill classification is deferred** until the user clicks "Generate Chapter 1". Iterating the TOC doesn't trigger skill-classification AI calls, which would otherwise be wasted work since the user may revise multiple times.
- **Revise prompt prioritizes preservation by instruction**, not by structured diff. The AI is told explicitly to output unmentioned chapters verbatim. If preservation drift becomes a real problem in practice, this can be upgraded to a structured-diff approach without changing the API shape.
- **Chapter count is locked** to whatever the user selected at book creation, unless the user's feedback text explicitly requests a different count. Enforcement is via prompt instruction + server-side truncation if the AI overshoots.
- **Feedback panel is a modal** following the existing `Dialog` + `ScrollableDialogContent` pattern used by `src/components/EditTagsDialog.tsx`, `src/components/ProfileDialog.tsx`, etc. — backdrop, focus trap, Esc to close.
- **TOC streams replace in place** during revision. The previous TOC content is cleared from the view as the new one streams in (matching the original creation experience).
- **No history of past TOC revisions** is kept. `toc.yml` is overwritten on each successful revise. Simpler, smaller blast radius, and history would be UX clutter the user did not ask for.

## Architecture Overview

### Status Machine

The book's `status` field reuses the dormant `'toc_review'` literal already present in `BookStatusSchema`. No new status values are added.

```
generating_toc  → TOC currently streaming
toc_review      → TOC done, user can approve or revise (NEWLY ACTIVATED)
generating      → skill classification + Chapter 1 streaming
reading         → Chapter 1 written, book is live
complete, failed → unchanged, orthogonal to this flow
```

Transition rules:
- `POST /api/books` ends in `toc_review` (previously went straight to `generating`).
- `POST /api/books/:id/toc/revise` only valid when status is `toc_review`. Status stays `toc_review` on success.
- `POST /api/books/:id/start` only valid when status is `toc_review`. Transitions `toc_review` → `generating` → `reading`.
- `failed` semantics unchanged — a revise that crashes the server transitions to `failed` like any other unhandled failure; a revise that just returns a parse error stays at `toc_review` (per the Error Handling table below).

### Data Model Changes

**`server/schemas.ts` — `BookStatusSchema`:**

No changes. The `'toc_review'` literal is already in the enum at `server/schemas.ts:74-81` (dormant). This design activates it.

`server/mcp-server.ts:62` already includes `'toc_review'` in its status enum mirror; no change needed there either.

`toc.yml` and `meta.yml` are the only persisted state.

While the book is in `toc_review`, `toc.yml` does **not** contain the `skills` or per-chapter `skills` keys. Those are populated only when `POST /api/books/:id/start` runs skill classification just before Chapter 1 generation.

### Backend: Endpoint Split

| Method | Path | Status | Purpose |
|--------|------|--------|---------|
| `POST` | `/api/books` | modified | Creates the book, streams TOC text, persists `toc.yml` (chapters only, no skills), persists `meta.yml` with `status: 'toc_review'`. Returns when `toc_done` SSE event fires. No skill classification, no Chapter 1, no quiz. |
| `POST` | `/api/books/:id/toc/revise` | new | Body: `{ feedback: string, model: string, provider?: string }`. Reads existing `toc.yml` + `meta.yml`. Streams a revised TOC via the AI with the preservation prompt. On stream completion: parses, truncates to `totalChapters` if AI overshoots, persists to `toc.yml`, updates `meta.title`/`meta.subtitle` if the AI changed them. Streams SSE events shaped like the existing TOC stream (`toc` chunks + final `toc_revised` event). 409 if status isn't `toc_review`. |
| `POST` | `/api/books/:id/start` | new | Body: `{ model, provider, quizModel, quizProvider, quizLength }` (same shape as the current `POST /api/books` body minus topic/details/chapterCount). Runs skill classification (deferred work). Streams Chapter 1 via the existing chapter-generation code. Generates and persists the quiz. Transitions status `toc_review` → `generating` → `reading`. 409 if status isn't `toc_review`. |

The existing `PUT /api/books/:id/toc` (line 1653 in `books.ts`) — which takes a full `{ chapters }` array for direct manual edits — stays as-is. It serves a different purpose (manual save) than `/toc/revise` (AI-mediated revise).

### Backend: Refactor

`books.ts` extracts the Chapter 1 + quiz generation block (currently lines ~1006-1055 inside the `POST /api/books` handler) into a shared helper:

```typescript
async function generateFirstChapterAndQuiz(
  bookId: string,
  send: (event: Record<string, unknown>) => void,
  opts: { provider: string; model: string; quizProvider: string; quizModel: string; quizLength: number },
): Promise<void>
```

This helper also runs the skill classification that currently lives at `books.ts:949-984` — since classification is deferred to start, it moves out of `POST /api/books` and into this helper. Both `/start` and any future test paths share one implementation.

### Revise Prompt

The revise endpoint sends this prompt to the AI:

```
You are revising an existing table of contents. Apply ONLY the
reader's targeted changes. Every chapter the reader did not
mention must be preserved EXACTLY — same title, same description,
same position.

Existing TOC:
# {existing title}
*{existing subtitle}*

1. **{ch1.title}** — {ch1.description}
2. **{ch2.title}** — {ch2.description}
...

Reader's requested changes:
{feedback}

Constraints:
- The revised TOC must have exactly {totalChapters} chapters,
  UNLESS the reader explicitly requested a different count in
  their feedback above.
- Preserve the title and subtitle UNLESS the reader asked to change them.
- For any chapter the reader did not reference, output it
  verbatim — do not rephrase, restructure, or "improve" it.
- Output in the same numbered markdown format as the existing TOC.

{optional profile context as in the current TOC prompt}

Just output the title and table of contents, nothing else.
```

The reader-profile context block (currently built by `buildProfileContext()` at `books.ts:86`) is included unchanged so revisions stay consistent with the reader's preferences.

Server-side validation after parsing the revised TOC:
- If `parsedChapters.length === 0`: stream an `error` event, do not persist, keep the existing TOC.
- If `parsedChapters.length > totalChapters`: truncate via the same `chapters.slice(0, targetCount)` pattern the current code uses at `books.ts:941`. (No detection logic for "did the user request a count change" — the AI was told the count in the prompt; if it returned the right count, we keep it; if it overshot, we truncate.)
- If `parsedChapters.length < totalChapters`: accept as-is (user may have asked for fewer; if not, the AI under-delivered and we surface the smaller TOC — user can revise again or accept).

### Frontend: CreationView State Machine

`src/components/CreationView.tsx` phases expand:

```
'toc'                 — streaming initial TOC (existing)
'awaiting_approval'   — TOC done, action buttons visible (NEW)
'revising'            — streaming a revised TOC (NEW)
'starting'            — user clicked Generate Ch1; streaming Ch1 + quiz (NEW)
'done'                — Ch1 + quiz persisted (existing)
'error'               — unchanged
```

The existing auto-transition `toc_done → 'chapter'` (lines 75-80) is replaced by `toc_done → 'awaiting_approval'`. No automatic Ch1 generation.

**`awaiting_approval` UI:**

The streamed TOC stays in the scroll area unchanged. The footer area (currently containing "Cancel" + "Start Book") shows:

```
[ Cancel ]      [ Provide Feedback ]   [ Generate Chapter 1 → ]
```

`Generate Chapter 1` is the primary button (existing purple/primary style). `Provide Feedback` is secondary (outline button). Both disabled while in `'revising'` or `'starting'`.

**Feedback modal:**

`src/components/ReviseTocDialog.tsx` (new). Uses the existing `Dialog` + `ScrollableDialogContent` pattern. Single multi-line `<textarea>` ("What would you like to change?") with placeholder examples. Footer: `Cancel` + `Revise`. On Revise:

1. Close modal.
2. CreationView phase → `'revising'`.
3. POST `/api/books/:id/toc/revise` with `{ feedback, model, provider }`.
4. Stream parsed via existing `parseSSEStream`. On each `toc` chunk, replace the streaming-content buffer for the TOC (use `useStreamingContent` — flush the existing content first to clear it, then append the new chunks).
5. On `toc_revised` (or whatever the terminal event is named — match existing `toc_done` shape for code reuse): phase → `'awaiting_approval'`.
6. On `error`: phase stays `'awaiting_approval'`, surface error toast, old TOC content restored.

**Generate Chapter 1 click:**

1. CreationView phase → `'starting'`.
2. POST `/api/books/:id/start` with `{ model, provider, quizModel, quizProvider, quizLength }`.
3. Stream parsed via existing `parseSSEStream`. Events flow into the chapter content area exactly as they do today (this is the same Ch1 + quiz code path, just triggered explicitly instead of auto-flowing from TOC).
4. On `done`: phase → `'done'`. Existing "Start Book" CTA enables.

**Library resume:**

If user clicks Cancel during `awaiting_approval` (or closes the app), the book exists with `status: 'toc_review'`. The library lists it with a small status indicator (a chip or icon — UI detail, follow existing `BookCard.tsx` patterns for status-derived visual variants). Clicking it routes to CreationView in resume mode:

- CreationView accepts an existing `bookId` prop (in addition to or instead of `topic`/`details`/`chapterCount`).
- In resume mode, CreationView fetches `GET /api/books/:id` + `GET /api/books/:id/toc` instead of POSTing to create.
- The fetched TOC is rendered into the TOC scroll area as static markdown. The saved TOC structure (`{ title, subtitle, chapters: [{title, description}] }`) is converted back to the same markdown format the AI emits (`# title\n*subtitle*\n\n1. **title** — description\n...`) via a small client-side helper (`src/lib/format-toc.ts` or colocated with CreationView). This keeps reconstruction client-side; no new endpoint needed.
- Phase initializes to `'awaiting_approval'` immediately.

`App.tsx` routing logic needs a branch: clicking a card with status `toc_review` opens CreationView in resume mode, not ReaderPage.

### Frontend: Library Status Indicator

`src/components/BookCard.tsx` and `src/components/BookListRow.tsx` already display status-derived chrome (progress bar, status text). Add handling for `'toc_review'`:

- Small badge text like "Awaiting approval" or an outlined chip — exact wording matches the existing status vocabulary used for `'generating'`/`'generating_toc'`.
- Clicking the card routes to CreationView in resume mode (handled in `App.tsx`).

## Testing

### Unit

- `parseTocFromMarkdown` already has implicit coverage from existing use. Add a focused test for the truncation case: AI returns N+2 chapters → handler returns exactly N.
- Status transition validation: `/toc/revise` and `/start` reject calls when status is not `toc_review` (return 409).

### Integration

Backend (using existing test setup with deterministic model mocks):

- `POST /api/books` returns when `toc_done` fires; book status on disk is `toc_review`; `toc.yml` exists and has no `skills` key.
- `POST /api/books/:id/toc/revise` with a deterministic mock that returns a modified TOC: chapter named in the feedback is changed, all other chapters byte-identical to before; `meta.totalChapters` unchanged.
- `POST /api/books/:id/toc/revise` when the mock returns N+1 chapters: persisted TOC has exactly N chapters.
- `POST /api/books/:id/toc/revise` when the mock returns 0 parseable chapters: returns error event, `toc.yml` on disk is unchanged.
- `POST /api/books/:id/start`: skill classification runs, `toc.yml` gains `skills` + per-chapter skills, Ch1 file created, quiz file created, status ends at `'reading'`.
- `POST /api/books/:id/toc/revise` after `/start` succeeded: 409.
- `POST /api/books/:id/start` called twice: second call returns 409.

### Frontend

CreationView state machine (Vitest + React Testing Library):

- Given an SSE stream of TOC chunks ending with `toc_done`: component lands in `'awaiting_approval'`, both action buttons visible.
- Click `Provide Feedback`: dialog opens; type text; click `Revise`: dialog closes, phase becomes `'revising'`, fetch fired against `/toc/revise` with the typed feedback.
- Given a successful revise stream: phase returns to `'awaiting_approval'`, new TOC visible.
- Click `Generate Chapter 1`: fetch fired against `/start`, phase becomes `'starting'`, Ch1 chunks render in the chapter area.

## Error Handling

| Failure | Behavior |
|---|---|
| Revise stream fails mid-flight | `toc.yml` unchanged (persistence only on stream success). Old TOC remains in view. Error toast. User can retry. |
| Revise returns 0 parseable chapters | Error event sent. Old TOC remains in view. Toast: "Couldn't parse the revised TOC — try rephrasing your feedback." |
| User clicks Generate Ch1 during revise | Button is disabled during `'revising'` phase. Not possible. |
| User closes window during revise | Existing SSE abort behavior. `toc.yml` unchanged (only persisted on success). On resume, the original TOC reappears. |
| `/start` or `/toc/revise` called when status isn't `toc_review` | 409 with `{ error: 'Invalid status', currentStatus }`. |
| `/start` succeeds but quiz generation fails | Quiz failure is already non-fatal in the current code (line 1044-1049); same behavior. Status still becomes `'reading'`. |
| AI changes title/subtitle the user didn't ask to change | Accepted as-is — the AI followed its instructions or didn't, we trust the prompt. User can revise again if they don't like it. |

## What This Design Deliberately Doesn't Do

- **Direct manual edits in the UI** (drag to reorder, click-to-rename a chapter inline). The user described a prompt-only feedback flow. The existing `PUT /api/books/:id/toc` endpoint already supports manual saves if a future UI wants to use it.
- **Revision history / undo.** No retention of past TOC versions; `toc.yml` is overwritten on each successful revise.
- **Diff-based AI revision.** Approach B (structured diff via `generateObject`) was considered and deferred. Prompt discipline first; upgrade if drift becomes a real problem.
- **Auto-detection of "user asked for a different chapter count".** The AI receives the count in the prompt; if it returns the right count we keep it, if it overshoots we truncate, if it undershoots we accept.
- **Editing the TOC after Chapter 1 has been generated.** Locked by design — written chapter content depends on the TOC it was generated from.
