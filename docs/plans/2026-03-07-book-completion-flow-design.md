# Book Completion Flow — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Finish Book" flow with final comprehensive quiz, star ratings, and performance display on library cards.

**Architecture:** When the user finishes the last chapter, "Keep Going" becomes "Finish Book". This triggers: feedback → final quiz (10 AI-generated synthesis questions) → star rating (0–5, half-star) → completion summary with "Back to Library". The `generate-next` route no longer sets status to `'complete'` — that happens when the user submits their rating. BookCard shows rating + final quiz score for completed books.

**Tech Stack:** TypeScript, React 19, Redux Toolkit, Fastify, Vercel AI SDK (`generateObject`), Zod, Tailwind CSS v4, shadcn/ui, lucide-react

---

### Task 1: Schema — Add `rating` and `finalQuizScore` to BookMeta

**Files:**
- Modify: `server/schemas.ts:44-54`

**Step 1: Add optional fields to BookMetaSchema**

In `server/schemas.ts`, add two optional fields to `BookMetaSchema` (after line 52):

```typescript
export const BookMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: BookStatusSchema,
  totalChapters: z.number().int().positive(),
  generatedUpTo: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  profileOverrides: z.record(z.string(), z.unknown()).optional(),
  rating: z.number().min(0).max(5).multipleOf(0.5).optional(),
  finalQuizScore: z.number().int().min(0).optional(),
  finalQuizTotal: z.number().int().min(0).optional(),
})
```

**Step 2: Verify existing books still parse**

Run: `pnpm test`
Expected: All existing tests pass (optional fields won't break existing YAML)

**Step 3: Commit**

```bash
git add server/schemas.ts
git commit -m "feat: add rating and finalQuizScore to BookMeta schema"
```

---

### Task 2: Server — Don't auto-complete in `generate-next`

**Files:**
- Modify: `server/routes/books.ts:218-221`

Currently `generate-next` sets `status = 'complete'` when the last chapter is generated (line 219-221). Remove this — status should stay `'reading'` until the user finishes the rating flow.

**Step 1: Remove auto-complete logic**

In `server/routes/books.ts`, change lines 218-223 from:

```typescript
      meta.generatedUpTo = nextNum
      if (nextNum >= meta.totalChapters) {
        meta.status = 'complete'
      }
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)
```

to:

```typescript
      meta.generatedUpTo = nextNum
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)
```

**Step 2: Commit**

```bash
git add server/routes/books.ts
git commit -m "fix: don't auto-set status to complete when last chapter generates"
```

---

### Task 3: Server — Rating endpoint

**Files:**
- Modify: `server/routes/books.ts` (add new route)

**Step 1: Add PUT /api/books/:id/rating route**

Add this route in `bookRoutes()` in `server/routes/books.ts`, after the delete route (after line 251):

```typescript
  fastify.put<{
    Params: { id: string }
    Body: { rating: number; finalQuizScore?: number; finalQuizTotal?: number }
  }>('/api/books/:id/rating', async (request) => {
    const meta = await store.getBook(request.params.id)
    meta.rating = request.body.rating
    if (request.body.finalQuizScore !== undefined) {
      meta.finalQuizScore = request.body.finalQuizScore
    }
    if (request.body.finalQuizTotal !== undefined) {
      meta.finalQuizTotal = request.body.finalQuizTotal
    }
    meta.status = 'complete'
    meta.updatedAt = new Date().toISOString()
    await store.saveBook(meta)
    return { ok: true }
  })
```

**Step 2: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: add PUT /api/books/:id/rating endpoint"
```

---

### Task 4: Server — Final quiz endpoint

**Files:**
- Modify: `server/routes/books.ts` (add new route)

**Step 1: Add POST /api/books/:id/final-quiz route**

Add this route in `bookRoutes()`, after the rating route:

```typescript
  fastify.post<{
    Params: { id: string }
    Body: { apiKey: string; model: string; provider?: string }
  }>('/api/books/:id/final-quiz', async (request) => {
    const { apiKey, model, provider } = request.body
    const bookId = request.params.id
    const meta = await store.getBook(bookId)
    const toc = await store.getToc(bookId)

    // Gather all chapter summaries (first 300 chars each to stay within context)
    const chapterSummaries: string[] = []
    for (let i = 1; i <= meta.generatedUpTo; i++) {
      try {
        const content = await store.getChapter(bookId, i)
        chapterSummaries.push(`Chapter ${i} "${toc.chapters[i - 1]?.title}": ${content.slice(0, 300)}...`)
      } catch { /* skip */ }
    }

    // Gather all prior quiz data to avoid repeating questions
    const allFeedback = await store.getAllFeedback(bookId)
    const priorQuestions = allFeedback.flatMap(fb =>
      fb.quiz.questions.map(q => q.question)
    )

    const result = await generateObject({
      model: createModelClient(provider ?? 'anthropic', apiKey, model),
      schema: z.object({
        questions: z.array(z.object({
          question: z.string(),
          options: z.array(z.string()).length(4),
          correctIndex: z.number().int().min(0).max(3),
        })).length(10),
      }),
      prompt: `You are creating a final comprehensive quiz for a book the reader has just finished.

Book: ${meta.title}
Topic: ${meta.prompt}

Table of Contents:
${toc.chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Chapter summaries:
${chapterSummaries.join('\n\n')}

Generate exactly 10 multiple-choice questions that test SYNTHESIS and CROSS-CHAPTER understanding. Each question should:
- Require knowledge from 2+ chapters to answer correctly
- Test connections between concepts, not just recall
- Have 4 options with exactly one correct answer
- Be meaningfully different from these previously asked questions:
${priorQuestions.map(q => `  - ${q}`).join('\n')}`,
    })

    return result.object
  })
```

**Step 2: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: add POST /api/books/:id/final-quiz endpoint"
```

---

### Task 5: StarRating component

**Files:**
- Create: `src/components/StarRating.tsx`

**Step 1: Create the StarRating component**

Create `src/components/StarRating.tsx`:

```tsx
import { useState } from 'react'
import { Star } from 'lucide-react'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function StarRating({ value, onChange, readonly = false, size = 'md' }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const displayValue = hoverValue ?? value

  const sizeClass = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-6'
  const gapClass = size === 'sm' ? 'gap-0.5' : size === 'lg' ? 'gap-1.5' : 'gap-1'

  return (
    <div
      className={`inline-flex ${gapClass}`}
      onMouseLeave={() => !readonly && setHoverValue(null)}
    >
      {[1, 2, 3, 4, 5].map(star => {
        const filled = displayValue >= star
        const halfFilled = !filled && displayValue >= star - 0.5

        return (
          <div key={star} className={`relative ${readonly ? '' : 'cursor-pointer'}`}>
            {/* Full star background (empty) */}
            <Star className={`${sizeClass} text-content-muted/20`} />

            {/* Filled overlay */}
            {(filled || halfFilled) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? '100%' : '50%' }}
              >
                <Star className={`${sizeClass} fill-amber-400 text-amber-400`} />
              </div>
            )}

            {/* Click targets — left half = X.5, right half = X.0 */}
            {!readonly && (
              <>
                <div
                  className="absolute inset-y-0 left-0 w-1/2"
                  onMouseEnter={() => setHoverValue(star - 0.5)}
                  onClick={() => onChange?.(star - 0.5)}
                />
                <div
                  className="absolute inset-y-0 right-0 w-1/2"
                  onMouseEnter={() => setHoverValue(star)}
                  onClick={() => onChange?.(star)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/StarRating.tsx
git commit -m "feat: add StarRating component with half-star support"
```

---

### Task 6: FeedbackForm — Configurable button text

**Files:**
- Modify: `src/components/FeedbackForm.tsx:4,9,49-55`

**Step 1: Add `submitLabel` prop**

Change the interface and button in `src/components/FeedbackForm.tsx`:

```typescript
interface FeedbackFormProps {
  chapterNum: number
  onSubmit: (liked: string, disliked: string) => void
  submitLabel?: string
}

export function FeedbackForm({ chapterNum, onSubmit, submitLabel }: FeedbackFormProps) {
```

And change line 17 (the subtitle) to conditionally show:
```tsx
<p className="mt-1 text-sm text-content-muted">
  Your feedback shapes how the next chapter is written.
</p>
```
Keep as-is since it's true conceptually even for the last chapter.

And change the button (line 49-55) from:
```tsx
<Button ...>Generate Next Chapter</Button>
```
to:
```tsx
<Button ...>{submitLabel ?? 'Generate Next Chapter'}</Button>
```

**Step 2: Commit**

```bash
git add src/components/FeedbackForm.tsx
git commit -m "feat: make FeedbackForm button text configurable"
```

---

### Task 7: BookCompleteSummary component

**Files:**
- Create: `src/components/BookCompleteSummary.tsx`

**Step 1: Create the component**

Create `src/components/BookCompleteSummary.tsx`:

```tsx
import { Button } from '@src/components/ui/button'
import { StarRating } from '@src/components/StarRating'
import { BookOpen, Award } from 'lucide-react'

interface BookCompleteSummaryProps {
  title: string
  totalChapters: number
  rating: number
  finalQuizScore: number
  finalQuizTotal: number
  onBackToLibrary: () => void
}

export function BookCompleteSummary({
  title,
  totalChapters,
  rating,
  finalQuizScore,
  finalQuizTotal,
  onBackToLibrary,
}: BookCompleteSummaryProps) {
  const percentage = Math.round((finalQuizScore / finalQuizTotal) * 100)

  return (
    <div className="mx-auto max-w-md px-8 py-16 text-center">
      <div className="rounded-2xl border border-border-default/50 bg-surface-raised/50 p-8 backdrop-blur-sm">
        <h2 className="text-2xl font-bold tracking-tight">Book Complete</h2>
        <p className="mt-1 text-sm text-content-muted">{title}</p>

        <div className="mt-8 flex justify-center">
          <StarRating value={rating} readonly size="lg" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <Award className="size-5 text-amber-400" />
            </div>
            <p className="text-2xl font-bold">{finalQuizScore}/{finalQuizTotal}</p>
            <p className="text-xs text-content-muted">Final Quiz ({percentage}%)</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <BookOpen className="size-5 text-[oklch(0.55_0.20_285)]" />
            </div>
            <p className="text-2xl font-bold">{totalChapters}</p>
            <p className="text-xs text-content-muted">Chapters Read</p>
          </div>
        </div>

        <div className="mt-10">
          <Button
            size="lg"
            onClick={onBackToLibrary}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            Back to Library
          </Button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/BookCompleteSummary.tsx
git commit -m "feat: add BookCompleteSummary component"
```

---

### Task 8: ReaderPage — Wire up finish book flow

**Files:**
- Modify: `src/pages/ReaderPage.tsx`

This is the largest change. The reader needs new phases and different behavior for the last chapter.

**Step 1: Update Phase type and add state**

In `src/pages/ReaderPage.tsx`, change line 35:

```typescript
type Phase = 'reading' | 'quiz' | 'feedback' | 'generating' | 'final-quiz' | 'rating' | 'complete'
```

Add new state after the existing state declarations (after line 42):

```typescript
const [finalQuizQuestions, setFinalQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
const [finalQuizScore, setFinalQuizScore] = useState(0)
const [finalQuizTotal, setFinalQuizTotal] = useState(0)
const [bookRating, setBookRating] = useState(0)
const [finalQuizLoading, setFinalQuizLoading] = useState(false)
```

**Step 2: Add last-chapter detection**

After `isOnLastGenerated` (line 48), add:

```typescript
const isLastChapter = chapterIndex + 1 === book.totalChapters
const isOnLastChapterReady = isLastChapter && generatedUpTo >= book.totalChapters
```

**Step 3: Update "Keep Going" / "Finish Book" button**

Change the button section (lines 329-339) to show the right button:

```tsx
{(isOnLastGenerated || isOnLastChapterReady) && (
  <div className="mt-12 flex justify-center">
    <Button
      size="lg"
      onClick={isOnLastChapterReady ? handleFinishBook : handleKeepGoing}
      className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
    >
      {isOnLastChapterReady ? 'Finish Book' : 'Keep Going'}
    </Button>
  </div>
)}
```

**Step 4: Add handleFinishBook**

Add this handler after `handleKeepGoing`:

```typescript
const handleFinishBook = useCallback(() => {
  setPhase('feedback')
  scrollRef.current?.scrollTo({ top: 0 })
}, [])
```

**Step 5: Add handleLastChapterFeedback**

Add this handler for the last chapter's feedback submission (separate from `handleFeedbackSubmit` which triggers generation):

```typescript
const handleLastChapterFeedback = useCallback(async (liked: string, disliked: string) => {
  dispatch(setChapterFeedback({ bookId: book.id, chapterNum: chapterIndex + 1, liked, disliked }))

  try {
    await fetch(`/api/books/${book.id}/chapters/${chapterIndex + 1}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liked, disliked }),
    })
  } catch {}

  // Fetch final quiz
  setFinalQuizLoading(true)
  setPhase('final-quiz')
  scrollRef.current?.scrollTo({ top: 0 })

  try {
    const res = await fetch(`/api/books/${book.id}/final-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, provider }),
    })
    if (res.ok) {
      const data = await res.json()
      setFinalQuizQuestions(data.questions)
    }
  } catch {}
  setFinalQuizLoading(false)
}, [book.id, chapterIndex, apiKey, model, provider, dispatch])
```

**Step 6: Add handleFinalQuizComplete**

```typescript
const handleFinalQuizComplete = useCallback((answers: number[]) => {
  const score = answers.filter((a, i) => a === finalQuizQuestions[i].correctIndex).length
  setFinalQuizScore(score)
  setFinalQuizTotal(finalQuizQuestions.length)
  setPhase('rating')
  scrollRef.current?.scrollTo({ top: 0 })
}, [finalQuizQuestions])
```

**Step 7: Add handleRatingSubmit**

```typescript
const handleRatingSubmit = useCallback(async () => {
  try {
    await fetch(`/api/books/${book.id}/rating`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: bookRating, finalQuizScore, finalQuizTotal }),
    })
  } catch {}
  setPhase('complete')
  scrollRef.current?.scrollTo({ top: 0 })
}, [book.id, bookRating, finalQuizScore, finalQuizTotal])
```

**Step 8: Update FeedbackForm usage — use different handler for last chapter**

Change the feedback phase rendering (lines 357-362):

```tsx
{phase === 'feedback' && (
  <FeedbackForm
    chapterNum={chapterIndex + 1}
    onSubmit={isLastChapter ? handleLastChapterFeedback : handleFeedbackSubmit}
    submitLabel={isLastChapter ? 'Continue to Final Quiz' : undefined}
  />
)}
```

**Step 9: Add final-quiz, rating, and complete phase rendering**

After the generating phase block (after line 377), add:

```tsx
{phase === 'final-quiz' && (
  <div className="mx-auto max-w-2xl px-8 py-8">
    {finalQuizLoading || finalQuizQuestions.length === 0 ? (
      <div className="flex items-center gap-2 pt-12 text-content-muted">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Generating your final quiz...</span>
      </div>
    ) : (
      <QuizPanel
        questions={finalQuizQuestions}
        onComplete={handleFinalQuizComplete}
        onSkip={() => {
          setFinalQuizScore(0)
          setFinalQuizTotal(finalQuizQuestions.length)
          setPhase('rating')
          scrollRef.current?.scrollTo({ top: 0 })
        }}
        title="Final Quiz"
        subtitle={`Test your understanding across all ${book.totalChapters} chapters.`}
      />
    )}
  </div>
)}

{phase === 'rating' && (
  <div className="mx-auto max-w-md px-8 py-16 text-center">
    <h2 className="text-xl font-semibold tracking-tight">Rate this book</h2>
    <p className="mt-1 text-sm text-content-muted">
      How would you rate your learning experience?
    </p>
    <div className="mt-8 flex justify-center">
      <StarRating value={bookRating} onChange={setBookRating} size="lg" />
    </div>
    <div className="mt-8">
      <Button
        size="lg"
        onClick={handleRatingSubmit}
        disabled={bookRating === 0}
        className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)] disabled:opacity-40"
      >
        Submit Rating
      </Button>
    </div>
  </div>
)}

{phase === 'complete' && (
  <BookCompleteSummary
    title={book.title}
    totalChapters={book.totalChapters}
    rating={bookRating}
    finalQuizScore={finalQuizScore}
    finalQuizTotal={finalQuizTotal}
    onBackToLibrary={onBack}
  />
)}
```

**Step 10: Add imports**

Add to the imports at the top of ReaderPage.tsx:

```typescript
import { StarRating } from '@src/components/StarRating'
import { BookCompleteSummary } from '@src/components/BookCompleteSummary'
```

**Step 11: Commit**

```bash
git add src/pages/ReaderPage.tsx
git commit -m "feat: wire up finish book flow with final quiz, rating, and complete phases"
```

---

### Task 9: QuizPanel — Support custom title/subtitle

**Files:**
- Modify: `src/components/QuizPanel.tsx:12-15,39-42`

**Step 1: Add optional title/subtitle props**

Update the interface:

```typescript
interface QuizPanelProps {
  questions: QuizQuestion[]
  onComplete: (answers: number[]) => void
  onSkip: () => void
  title?: string
  subtitle?: string
}

export function QuizPanel({ questions, onComplete, onSkip, title, subtitle }: QuizPanelProps) {
```

Change lines 39-42:

```tsx
<h2 className="text-xl font-semibold tracking-tight">{title ?? 'Quick Quiz'}</h2>
<p className="mt-1 text-sm text-content-muted">
  {subtitle ?? 'Test your understanding of this chapter.'}
</p>
```

**Step 2: Commit**

```bash
git add src/components/QuizPanel.tsx
git commit -m "feat: support custom title/subtitle in QuizPanel"
```

---

### Task 10: BookCard — Show rating and score

**Files:**
- Modify: `src/components/BookCard.tsx`

**Step 1: Add rating and score props**

Update the interface and component in `src/components/BookCard.tsx`:

```typescript
interface BookCardProps {
  title: string
  chaptersRead: number
  totalChapters: number
  rating?: number
  finalQuizScore?: number
  finalQuizTotal?: number
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function BookCard({ title, chaptersRead, totalChapters, rating, finalQuizScore, finalQuizTotal, onClick, onContextMenu }: BookCardProps) {
```

**Step 2: Add rating and score display below the meta**

Change the meta section (lines 52-62). After the existing chapter count text, add:

```tsx
{/* Meta */}
<div className="mt-2.5 px-0.5">
  <p className="line-clamp-1 text-[0.875em] font-medium text-content-primary">
    {title}
  </p>
  {rating != null ? (
    <div className="mt-0.5 flex items-center gap-2">
      <StarRating value={rating} readonly size="sm" />
      {finalQuizScore != null && finalQuizTotal != null && (
        <span className="text-[0.75em] text-content-muted">{finalQuizScore}/{finalQuizTotal}</span>
      )}
    </div>
  ) : (
    <p className="mt-0.5 text-[0.75em] text-content-muted">
      {chaptersRead === 0
        ? `${totalChapters} chapters`
        : `${chaptersRead} of ${totalChapters} chapters`}
    </p>
  )}
</div>
```

Add import at top:

```typescript
import { StarRating } from '@src/components/StarRating'
```

**Step 3: Commit**

```bash
git add src/components/BookCard.tsx
git commit -m "feat: show star rating and final quiz score on BookCard"
```

---

### Task 11: App.tsx — Pass rating data + "Rate" context menu

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update Book interface to include rating fields**

Change the `Book` interface (lines 21-26):

```typescript
interface Book {
  id: string
  title: string
  chaptersRead: number
  totalChapters: number
  status?: string
  rating?: number
  finalQuizScore?: number
  finalQuizTotal?: number
}
```

**Step 2: Pass rating data from API response**

Update `fetchBooks` (line 107) to include new fields:

```typescript
books.map((b: { id: string; title: string; totalChapters: number; generatedUpTo: number; status?: string; rating?: number; finalQuizScore?: number; finalQuizTotal?: number }) => ({
  id: b.id,
  title: b.title,
  chaptersRead: 0,
  totalChapters: b.totalChapters,
  status: b.status,
  rating: b.rating,
  finalQuizScore: b.finalQuizScore,
  finalQuizTotal: b.finalQuizTotal,
})),
```

**Step 3: Pass rating props to BookCard**

Update the BookCard rendering (lines 231-241) to pass the new props:

```tsx
<BookCard
  key={book.id}
  title={book.title}
  chaptersRead={chaptersRead}
  totalChapters={book.totalChapters}
  rating={book.rating}
  finalQuizScore={book.finalQuizScore}
  finalQuizTotal={book.finalQuizTotal}
  onClick={() => setView({ type: 'reading', book })}
  onContextMenu={...}
/>
```

**Step 4: Add "Rate" to context menu + rating dialog state**

Add state for rating dialog (after line 41):

```typescript
const [rateDialog, setRateDialog] = useState<{ book: Book; rating: number } | null>(null)
```

Add "Rate" button to context menu (after the Rename button, around line 263):

```tsx
<button
  onClick={() => {
    setRateDialog({ book: contextMenu.book, rating: contextMenu.book.rating ?? 0 })
    setContextMenu(null)
  }}
  className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
>
  Rate
</button>
```

**Step 5: Add Rate dialog**

After the delete dialog (after line 318), add:

```tsx
{/* Rate dialog */}
<Dialog open={!!rateDialog} onOpenChange={open => { if (!open) setRateDialog(null) }}>
  <DialogContent className="sm:max-w-xs">
    <DialogHeader>
      <DialogTitle>Rate Book</DialogTitle>
      <DialogDescription>{rateDialog?.book.title}</DialogDescription>
    </DialogHeader>
    <div className="flex justify-center py-4">
      <StarRating
        value={rateDialog?.rating ?? 0}
        onChange={val => setRateDialog(prev => prev ? { ...prev, rating: val } : null)}
        size="lg"
      />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setRateDialog(null)}>Cancel</Button>
      <Button
        onClick={async () => {
          if (!rateDialog) return
          try {
            await fetch(`/api/books/${rateDialog.book.id}/rating`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rating: rateDialog.rating }),
            })
            await fetchBooks()
          } catch {}
          setRateDialog(null)
        }}
        disabled={!rateDialog?.rating}
      >
        Save
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Add import:

```typescript
import { StarRating } from '@src/components/StarRating'
```

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: show ratings on library cards with Rate context menu"
```

---

### Task 12: Verify end-to-end

**Step 1: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: No type errors

**Step 3: Manual smoke test**

Run: `pnpm dev:server` and `pnpm dev`

Test flow:
1. Open a book that's on its last generated chapter
2. Click "Finish Book"
3. Submit feedback
4. Answer final quiz (10 questions)
5. Rate the book (half-star)
6. See completion summary
7. Click "Back to Library"
8. Verify BookCard shows star rating + score
9. Right-click → Rate → change rating

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: book completion flow — final quiz, star ratings, library performance display"
```
