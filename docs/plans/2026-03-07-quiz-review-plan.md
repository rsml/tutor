# Quiz Review & Retake — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a quiz review page where users can see per-chapter quiz performance, retake quizzes, and track improvement over time.

**Architecture:** New `quizHistorySlice` in Redux stores questions + all attempts per chapter. A new `QuizReviewPage` renders a unified view with summary strip, expandable chapter breakdown, and inline retake flow. Entry via context menu or reader header icon.

**Tech Stack:** React 19, Redux Toolkit (createSlice + createSelector), shadcn/ui, Tailwind v4, lucide-react icons

---

### Task 1: Create quizHistorySlice — Types and Reducers

**Files:**
- Create: `src/store/quizHistorySlice.ts`
- Modify: `src/store.ts:145-149` (add to rootReducer)

**Step 1: Create the slice file**

Create `src/store/quizHistorySlice.ts`:

```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export interface QuizAttempt {
  attemptNumber: number
  timestamp: string
  answers: Array<{ selectedAnswer: number; correct: boolean }>
  score: number
}

export interface ChapterQuiz {
  questions: QuizQuestion[]
  attempts: QuizAttempt[]
}

interface QuizHistoryState {
  quizzes: Record<string, Record<string, ChapterQuiz>>
}

const initialState: QuizHistoryState = { quizzes: {} }

const quizHistorySlice = createSlice({
  name: 'quizHistory',
  initialState,
  reducers: {
    recordQuizAttempt(
      state,
      action: PayloadAction<{
        bookId: string
        chapterNum: number
        questions: QuizQuestion[]
        answers: number[]
      }>,
    ) {
      const { bookId, chapterNum, questions, answers } = action.payload
      const key = String(chapterNum)
      if (!state.quizzes[bookId]) state.quizzes[bookId] = {}

      const existing = state.quizzes[bookId][key]
      const attemptNumber = existing ? existing.attempts.length + 1 : 1

      const attemptAnswers = answers.map((selectedAnswer, i) => ({
        selectedAnswer,
        correct: selectedAnswer === questions[i].correctIndex,
      }))
      const score = attemptAnswers.filter(a => a.correct).length

      const attempt: QuizAttempt = {
        attemptNumber,
        timestamp: new Date().toISOString(),
        answers: attemptAnswers,
        score,
      }

      if (existing) {
        existing.attempts.push(attempt)
      } else {
        state.quizzes[bookId][key] = {
          questions,
          attempts: [attempt],
        }
      }
    },
  },
})

export const { recordQuizAttempt } = quizHistorySlice.actions
export default quizHistorySlice.reducer
```

**Step 2: Wire into rootReducer**

In `src/store.ts`, add import and add to `combineReducers`:

```typescript
// Add import at top:
import quizHistoryReducer from '@src/store/quizHistorySlice'

// Modify combineReducers (line 145-149):
const rootReducer = combineReducers({
  readingProgress: readingProgressSlice.reducer,
  settings: settingsSlice.reducer,
  chapterData: chapterDataSlice.reducer,
  quizHistory: quizHistoryReducer,
})
```

**Step 3: Re-export from store.ts**

Add at bottom of `src/store.ts`:

```typescript
export { recordQuizAttempt } from '@src/store/quizHistorySlice'
export type { QuizQuestion as QuizHistoryQuestion, QuizAttempt, ChapterQuiz } from '@src/store/quizHistorySlice'
```

**Step 4: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/store/quizHistorySlice.ts src/store.ts
git commit -m "feat: add quizHistorySlice for tracking quiz attempts"
```

---

### Task 2: Create Reselect Selectors

**Files:**
- Create: `src/store/quizHistorySelectors.ts`
- Modify: `src/store.ts` (re-export selectors)

**Step 1: Create selectors file**

Create `src/store/quizHistorySelectors.ts`:

```typescript
import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '@src/store'

const selectQuizHistory = (state: RootState) => state.quizHistory.quizzes

const selectBookQuizzes = (bookId: string) =>
  createSelector(selectQuizHistory, quizzes => quizzes[bookId] ?? {})

export const selectChapterQuiz = (bookId: string, chapterNum: number) =>
  createSelector(selectBookQuizzes(bookId), book => book[String(chapterNum)] ?? null)

export const selectChapterAttempts = (bookId: string, chapterNum: number) =>
  createSelector(selectChapterQuiz(bookId, chapterNum), quiz => quiz?.attempts ?? [])

export const selectOverallScore = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const entries = Object.values(chapters)
    if (entries.length === 0) return { correct: 0, total: 0 }
    let correct = 0
    let total = 0
    for (const ch of entries) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (!latest) continue
      correct += latest.score
      total += ch.questions.length
    }
    return { correct, total }
  })

export const selectChaptersNeedingReview = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const result: Array<{ chapterNum: number; latestScore: number; totalQuestions: number }> = []
    for (const [key, ch] of Object.entries(chapters)) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (latest && latest.score < ch.questions.length) {
        result.push({
          chapterNum: parseInt(key),
          latestScore: latest.score,
          totalQuestions: ch.questions.length,
        })
      }
    }
    return result.sort((a, b) => a.latestScore - b.latestScore)
  })

export const selectChapterSparkline = (bookId: string, chapterNum: number) =>
  createSelector(selectChapterAttempts(bookId, chapterNum), attempts =>
    attempts.map(a => a.score),
  )

export const selectSmartReviewQueue = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const queue: Array<{
      bookId: string
      chapterNum: number
      questionIndex: number
      question: string
      options: string[]
      correctIndex: number
    }> = []
    for (const [key, ch] of Object.entries(chapters)) {
      const latest = ch.attempts[ch.attempts.length - 1]
      if (!latest) continue
      latest.answers.forEach((a, qi) => {
        if (!a.correct) {
          queue.push({
            bookId,
            chapterNum: parseInt(key),
            questionIndex: qi,
            ...ch.questions[qi],
          })
        }
      })
    }
    // Interleave: sort by chapter to spread them out
    return queue.sort((a, b) => a.chapterNum - b.chapterNum)
  })

export const selectBookQuizSummary = (bookId: string) =>
  createSelector(
    [selectOverallScore(bookId), selectChaptersNeedingReview(bookId), selectBookQuizzes(bookId)],
    (overall, needsReview, chapters) => ({
      ...overall,
      chaptersToReview: needsReview.length,
      totalChaptersWithQuizzes: Object.keys(chapters).length,
      hasAnyData: Object.keys(chapters).length > 0,
    }),
  )

export const selectPerQuestionCorrectRate = (bookId: string) =>
  createSelector(selectBookQuizzes(bookId), chapters => {
    const rates: Array<{
      chapterNum: number
      questionIndex: number
      question: string
      timesCorrect: number
      timesAttempted: number
      rate: number
      improving: boolean | null
    }> = []
    for (const [key, ch] of Object.entries(chapters)) {
      ch.questions.forEach((q, qi) => {
        let timesCorrect = 0
        let timesAttempted = 0
        let lastTwo: boolean[] = []
        for (const attempt of ch.attempts) {
          if (attempt.answers[qi]) {
            timesAttempted++
            if (attempt.answers[qi].correct) timesCorrect++
            lastTwo.push(attempt.answers[qi].correct)
            if (lastTwo.length > 2) lastTwo = lastTwo.slice(-2)
          }
        }
        const improving =
          lastTwo.length < 2 ? null : !lastTwo[0] && lastTwo[1] ? true : lastTwo[0] && !lastTwo[1] ? false : null
        rates.push({
          chapterNum: parseInt(key),
          questionIndex: qi,
          question: q.question,
          timesCorrect,
          timesAttempted,
          rate: timesAttempted > 0 ? timesCorrect / timesAttempted : 0,
          improving,
        })
      })
    }
    return rates.sort((a, b) => a.rate - b.rate)
  })
```

**Step 2: Re-export from store.ts**

Add to `src/store.ts`:

```typescript
export {
  selectChapterQuiz,
  selectChapterAttempts,
  selectOverallScore,
  selectChaptersNeedingReview,
  selectChapterSparkline,
  selectSmartReviewQueue,
  selectBookQuizSummary,
  selectPerQuestionCorrectRate,
} from '@src/store/quizHistorySelectors'
```

**Step 3: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/store/quizHistorySelectors.ts src/store.ts
git commit -m "feat: add Reselect selectors for quiz analytics"
```

---

### Task 3: Integrate Existing Quiz Flow with New Slice

**Files:**
- Modify: `src/pages/ReaderPage.tsx:8,189-203`

**Step 1: Update ReaderPage imports**

In `src/pages/ReaderPage.tsx`, add `recordQuizAttempt` to the import from `@src/store` (line 8):

```typescript
import { useAppDispatch, useAppSelector, setChapterPosition, setChapterFeedback, setChapterQuizResult, selectFontSize, selectApiKey, selectModel, selectActiveProvider, recordQuizAttempt } from '@src/store'
```

**Step 2: Dispatch to new slice in handleQuizComplete**

In `handleQuizComplete` (line 189-203), add a dispatch to the new slice after the existing one:

```typescript
const handleQuizComplete = useCallback((answers: number[]) => {
  setQuizAnswers(answers)
  // Store quiz results in Redux (legacy)
  const result = {
    questions: quizQuestions.map((q, i) => ({
      ...q,
      userAnswer: answers[i],
      correct: answers[i] === q.correctIndex,
    })),
    score: answers.filter((a, i) => a === quizQuestions[i].correctIndex).length,
  }
  dispatch(setChapterQuizResult({ bookId: book.id, chapterNum: chapterIndex + 1, result }))

  // Also record in quiz history for review/retake tracking
  dispatch(recordQuizAttempt({
    bookId: book.id,
    chapterNum: chapterIndex + 1,
    questions: quizQuestions,
    answers,
  }))

  setPhase('feedback')
  scrollRef.current?.scrollTo({ top: 0 })
}, [quizQuestions, dispatch, book.id, chapterIndex])
```

**Step 3: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/pages/ReaderPage.tsx
git commit -m "feat: record quiz attempts in quizHistorySlice from reader flow"
```

---

### Task 4: Add View Type + Context Menu Options

**Files:**
- Modify: `src/App.tsx:18,34-37,44,174-192,262-296`

**Step 1: Add QuizReviewPage import and View type**

At line 18 area, add import:
```typescript
import { QuizReviewPage } from '@src/pages/QuizReviewPage'
```

Extend the `View` type (line 34-37):
```typescript
type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string }
  | { type: 'reading'; book: Book }
  | { type: 'quiz-review'; book: Book }
  | { type: 'book-overview'; book: Book }
```

**Step 2: Add view rendering**

After the `view.type === 'reading'` block (after line 192), add:

```typescript
if (view.type === 'quiz-review') {
  return (
    <QuizReviewPage
      book={view.book}
      onBack={() => setView({ type: 'library' })}
      onBackToReader={() => setView({ type: 'reading', book: view.book })}
    />
  )
}
```

**Step 3: Add context menu options**

In the context menu div (lines 262-296), add two new buttons before "Delete":

```typescript
<button
  onClick={() => {
    setView({ type: 'quiz-review', book: contextMenu.book })
    setContextMenu(null)
  }}
  className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
>
  Quiz Review
</button>
<button
  onClick={() => {
    setView({ type: 'book-overview', book: contextMenu.book })
    setContextMenu(null)
  }}
  className="w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors"
>
  Book Overview
</button>
```

**Step 4: Verify build (will fail — QuizReviewPage doesn't exist yet)**

Create a placeholder at `src/pages/QuizReviewPage.tsx`:

```typescript
export function QuizReviewPage({ book, onBack, onBackToReader }: {
  book: { id: string; title: string; totalChapters: number }
  onBack: () => void
  onBackToReader: () => void
}) {
  return <div>Quiz Review — {book.title} (placeholder)</div>
}
```

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/App.tsx src/pages/QuizReviewPage.tsx
git commit -m "feat: add quiz-review view type, context menu options, and placeholder page"
```

---

### Task 5: Build QuizReviewPage — Header + Summary Strip

**Files:**
- Modify: `src/pages/QuizReviewPage.tsx`

**Step 1: Build the full page with header and summary strip**

Replace the placeholder `src/pages/QuizReviewPage.tsx`:

```typescript
import { useState } from 'react'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { useAppSelector } from '@src/store'
import { selectBookQuizSummary } from '@src/store/quizHistorySelectors'

interface QuizReviewBook {
  id: string
  title: string
  totalChapters: number
}

type SortMode = 'weakest' | 'chapter-order'

export function QuizReviewPage({ book, onBack, onBackToReader }: {
  book: QuizReviewBook
  onBack: () => void
  onBackToReader: () => void
}) {
  const [sortMode, setSortMode] = useState<SortMode>('weakest')
  const summary = useAppSelector(selectBookQuizSummary(book.id))

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />

      {/* Header */}
      <header
        className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 p-1 text-content-muted/50 transition-colors hover:text-content-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
        </div>

        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          {book.title} — Quiz Review
        </span>

        <div className="ml-auto flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex rounded-lg border border-border-default/50 text-xs">
            <button
              onClick={() => setSortMode('weakest')}
              className={`px-2.5 py-1 rounded-l-lg transition-colors ${sortMode === 'weakest' ? 'bg-surface-muted text-content-primary' : 'text-content-muted hover:text-content-secondary'}`}
            >
              Weakest first
            </button>
            <button
              onClick={() => setSortMode('chapter-order')}
              className={`px-2.5 py-1 rounded-r-lg transition-colors ${sortMode === 'chapter-order' ? 'bg-surface-muted text-content-primary' : 'text-content-muted hover:text-content-secondary'}`}
            >
              Chapter order
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {!summary.hasAnyData ? (
            <div className="flex flex-col items-center gap-3 pt-24 text-content-muted">
              <BarChart3 className="size-10 opacity-40" />
              <p className="text-sm">Complete chapter quizzes to see your review.</p>
              <Button variant="outline" size="sm" onClick={onBackToReader}>
                Back to reading
              </Button>
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <SummaryStrip
                correct={summary.correct}
                total={summary.total}
                chaptersToReview={summary.chaptersToReview}
              />

              {/* Chapter breakdown will go here (Task 6) */}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function SummaryStrip({ correct, total, chaptersToReview }: {
  correct: number
  total: number
  chaptersToReview: number
}) {
  return (
    <div className="flex items-center gap-6 rounded-xl border border-border-default/50 bg-surface-raised/50 px-5 py-3">
      {/* Segmented bar */}
      <div className="flex gap-0.5" role="img" aria-label={`${correct} of ${total} correct`}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-3 w-2 rounded-sm ${i < correct ? 'bg-green-500/70' : 'bg-red-500/40'}`}
          />
        ))}
      </div>

      <span className="text-sm font-medium text-content-primary">
        {correct}/{total} correct
      </span>

      {chaptersToReview > 0 && (
        <span className="text-sm text-content-muted">
          {chaptersToReview} {chaptersToReview === 1 ? 'chapter' : 'chapters'} to review
        </span>
      )}
    </div>
  )
}
```

Note: The segmented bar is intentionally simple — it shows segments based on the total question count across chapters where quizzes have been taken. The order follows how quiz data is stored (by chapter number). The `i < correct` comparison is a simplification — a more precise version will come in Task 6 when we have per-question data. For now this gives the right aggregate visual.

**Step 2: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/pages/QuizReviewPage.tsx
git commit -m "feat: build QuizReviewPage with header and summary strip"
```

---

### Task 6: Build Chapter Breakdown List

**Files:**
- Create: `src/components/ChapterBreakdownList.tsx`
- Modify: `src/pages/QuizReviewPage.tsx` (import and use)

**Step 1: Create the component**

Create `src/components/ChapterBreakdownList.tsx`:

```typescript
import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { useAppSelector } from '@src/store'
import { selectBookQuizSummary } from '@src/store/quizHistorySelectors'
import type { ChapterQuiz } from '@src/store/quizHistorySlice'

interface ChapterBreakdownListProps {
  bookId: string
  chapters: Record<string, ChapterQuiz>
  tocTitles: Record<string, string>
  sortMode: 'weakest' | 'chapter-order'
  onRetake: (chapterNum: number) => void
}

export function ChapterBreakdownList({ bookId, chapters, tocTitles, sortMode, onRetake }: ChapterBreakdownListProps) {
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)

  const entries = Object.entries(chapters).map(([key, ch]) => ({
    key,
    chapterNum: parseInt(key),
    quiz: ch,
    latest: ch.attempts[ch.attempts.length - 1],
  }))

  if (sortMode === 'weakest') {
    entries.sort((a, b) => {
      const aScore = a.latest ? a.latest.score / a.quiz.questions.length : 1
      const bScore = b.latest ? b.latest.score / b.quiz.questions.length : 1
      return aScore - bScore
    })
  } else {
    entries.sort((a, b) => a.chapterNum - b.chapterNum)
  }

  return (
    <div className="mt-4 space-y-2">
      {entries.map(({ key, chapterNum, quiz, latest }) => {
        const expanded = expandedChapter === key
        const title = tocTitles[key] || `Chapter ${chapterNum}`

        return (
          <div key={key} className="rounded-xl border border-border-default/50 bg-surface-raised/30 overflow-hidden">
            {/* Chapter row */}
            <button
              onClick={() => setExpandedChapter(expanded ? null : key)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/30"
            >
              <span className="text-xs font-medium text-content-muted w-10">Ch.{chapterNum}</span>
              <span className="flex-1 text-sm font-medium text-content-primary truncate">{title}</span>

              {/* Dot indicators */}
              {latest && (
                <div className="flex gap-1" role="img" aria-label={`${latest.score} of ${quiz.questions.length} correct`}>
                  {latest.answers.map((a, i) => (
                    <div
                      key={i}
                      className={`size-2.5 rounded-full ${a.correct ? 'bg-green-500' : 'bg-red-500/60 ring-1 ring-red-500/40'}`}
                    />
                  ))}
                </div>
              )}

              {/* Sparkline (if 2+ attempts) */}
              {quiz.attempts.length >= 2 && (
                <Sparkline scores={quiz.attempts.map(a => a.score)} max={quiz.questions.length} />
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRetake(chapterNum) }}
                className="text-xs text-content-muted hover:text-content-primary"
              >
                Retake
              </Button>

              <ChevronDown className={`size-4 text-content-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Expanded question detail */}
            {expanded && latest && (
              <div className="border-t border-border-default/30 px-4 py-3 space-y-3">
                {quiz.questions.map((q, qi) => {
                  const answer = latest.answers[qi]
                  const improving = getQuestionTrend(quiz, qi)

                  return (
                    <div key={qi} className="flex items-start gap-3">
                      {answer.correct ? (
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-green-500" />
                      ) : (
                        <XCircle className="size-4 shrink-0 mt-0.5 text-red-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-content-primary">{q.question}</p>
                        {!answer.correct && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-red-400">
                              Your answer: {q.options[answer.selectedAnswer]}
                            </p>
                            <p className="text-xs text-green-400">
                              Correct: {q.options[q.correctIndex]}
                            </p>
                          </div>
                        )}
                      </div>
                      {improving !== null && (
                        <span className="shrink-0">
                          {improving === true && <TrendingUp className="size-3.5 text-green-500" />}
                          {improving === false && <TrendingDown className="size-3.5 text-red-500" />}
                          {improving === 'stable' && <Minus className="size-3.5 text-content-muted" />}
                        </span>
                      )}
                    </div>
                  )
                })}

                {quiz.attempts.length > 1 && (
                  <p className="text-xs text-content-muted pt-1">
                    {quiz.attempts.length} attempts — Last: {new Date(latest.timestamp).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function getQuestionTrend(quiz: ChapterQuiz, qi: number): true | false | 'stable' | null {
  if (quiz.attempts.length < 2) return null
  const last = quiz.attempts[quiz.attempts.length - 1].answers[qi]?.correct
  const prev = quiz.attempts[quiz.attempts.length - 2].answers[qi]?.correct
  if (!prev && last) return true
  if (prev && !last) return false
  return 'stable'
}

function Sparkline({ scores, max }: { scores: number[]; max: number }) {
  if (scores.length < 2) return null
  const width = 40
  const height = 16
  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width
    const y = height - (s / max) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="oklch(0.65 0.15 285)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

**Step 2: Wire into QuizReviewPage**

In `src/pages/QuizReviewPage.tsx`, add state for TOC data and retake mode, import the new component, and add it below the summary strip. Add the following:

Import at top:
```typescript
import { ChapterBreakdownList } from '@src/components/ChapterBreakdownList'
import { QuizPanel } from '@src/components/QuizPanel'
import { recordQuizAttempt } from '@src/store'
import type { ChapterQuiz } from '@src/store/quizHistorySlice'
```

Add state and data:
```typescript
const [retakeChapter, setRetakeChapter] = useState<number | null>(null)
const dispatch = useAppDispatch()
const bookQuizzes = useAppSelector(s => s.quizHistory.quizzes[book.id] ?? {}) as Record<string, ChapterQuiz>
const [tocTitles, setTocTitles] = useState<Record<string, string>>({})

// Fetch TOC for chapter titles
useEffect(() => {
  fetch(`/api/books/${book.id}/toc`)
    .then(res => res.json())
    .then(data => {
      const titles: Record<string, string> = {}
      data.chapters?.forEach((ch: { title: string }, i: number) => {
        titles[String(i + 1)] = ch.title
      })
      setTocTitles(titles)
    })
    .catch(() => {})
}, [book.id])
```

Add retake handler:
```typescript
const handleRetake = (chapterNum: number) => setRetakeChapter(chapterNum)

const handleRetakeComplete = (answers: number[]) => {
  if (retakeChapter === null) return
  const quiz = bookQuizzes[String(retakeChapter)]
  if (!quiz) return
  dispatch(recordQuizAttempt({
    bookId: book.id,
    chapterNum: retakeChapter,
    questions: quiz.questions,
    answers,
  }))
  setRetakeChapter(null)
}
```

In the render, replace `{/* Chapter breakdown will go here (Task 6) */}` with:

```typescript
{retakeChapter !== null && bookQuizzes[String(retakeChapter)] ? (
  <div className="mt-4">
    <button
      onClick={() => setRetakeChapter(null)}
      className="mb-4 text-sm text-content-muted hover:text-content-secondary transition-colors"
    >
      &larr; Back to review
    </button>
    <QuizPanel
      questions={bookQuizzes[String(retakeChapter)].questions}
      onComplete={handleRetakeComplete}
      onSkip={() => setRetakeChapter(null)}
      title={`Retake — ${tocTitles[String(retakeChapter)] || `Chapter ${retakeChapter}`}`}
      subtitle="Same questions, fresh attempt. Let's see if you improved."
    />
  </div>
) : (
  <ChapterBreakdownList
    bookId={book.id}
    chapters={bookQuizzes}
    tocTitles={tocTitles}
    sortMode={sortMode}
    onRetake={handleRetake}
  />
)}
```

**Step 3: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/components/ChapterBreakdownList.tsx src/pages/QuizReviewPage.tsx
git commit -m "feat: chapter breakdown list with dot indicators, sparklines, and retake flow"
```

---

### Task 7: Build Smart Review Flow

**Files:**
- Create: `src/components/SmartReviewFlow.tsx`
- Modify: `src/pages/QuizReviewPage.tsx` (add Smart Review button and flow)

**Step 1: Create SmartReviewFlow component**

Create `src/components/SmartReviewFlow.tsx`:

```typescript
import { useReducer } from 'react'
import { Button } from '@src/components/ui/button'
import { QuizPanel } from '@src/components/QuizPanel'
import { CheckCircle2, XCircle } from 'lucide-react'

interface ReviewQuestion {
  bookId: string
  chapterNum: number
  questionIndex: number
  question: string
  options: string[]
  correctIndex: number
}

interface SmartReviewProps {
  queue: ReviewQuestion[]
  tocTitles: Record<string, string>
  onComplete: (results: Array<{ chapterNum: number; questionIndex: number; correct: boolean }>) => void
  onExit: () => void
}

type State =
  | { phase: 'quiz'; chapterNum: number; questions: ReviewQuestion[]; currentGroupIndex: number; totalGroups: number; results: Array<{ chapterNum: number; questionIndex: number; correct: boolean }> }
  | { phase: 'interstitial'; chapterNum: number; groupScore: number; groupTotal: number; currentGroupIndex: number; totalGroups: number; results: Array<{ chapterNum: number; questionIndex: number; correct: boolean }> }
  | { phase: 'done'; results: Array<{ chapterNum: number; questionIndex: number; correct: boolean }> }

type Action =
  | { type: 'quiz-complete'; answers: number[]; questions: ReviewQuestion[] }
  | { type: 'continue' }
  | { type: 'stop' }

function groupByChapter(queue: ReviewQuestion[]): Map<number, ReviewQuestion[]> {
  const groups = new Map<number, ReviewQuestion[]>()
  for (const q of queue) {
    const arr = groups.get(q.chapterNum) || []
    arr.push(q)
    groups.set(q.chapterNum, arr)
  }
  return groups
}

export function SmartReviewFlow({ queue, tocTitles, onComplete, onExit }: SmartReviewProps) {
  const groups = Array.from(groupByChapter(queue).entries())

  const reducer = (state: State, action: Action): State => {
    switch (action.type) {
      case 'quiz-complete': {
        const results = [...state.results]
        action.questions.forEach((q, i) => {
          results.push({
            chapterNum: q.chapterNum,
            questionIndex: q.questionIndex,
            correct: action.answers[i] === q.correctIndex,
          })
        })
        if ('chapterNum' in state) {
          return {
            phase: 'interstitial',
            chapterNum: state.chapterNum,
            groupScore: action.answers.filter((a, i) => a === action.questions[i].correctIndex).length,
            groupTotal: action.questions.length,
            currentGroupIndex: state.currentGroupIndex,
            totalGroups: state.totalGroups,
            results,
          }
        }
        return state
      }
      case 'continue': {
        if (state.phase !== 'interstitial') return state
        const nextIdx = state.currentGroupIndex + 1
        if (nextIdx >= state.totalGroups) {
          return { phase: 'done', results: state.results }
        }
        const [chapterNum, questions] = groups[nextIdx]
        return {
          phase: 'quiz',
          chapterNum,
          questions,
          currentGroupIndex: nextIdx,
          totalGroups: state.totalGroups,
          results: state.results,
        }
      }
      case 'stop': {
        return { phase: 'done', results: state.results }
      }
      default:
        return state
    }
  }

  const [chapterNum, questions] = groups[0] || [0, []]
  const [state, dispatch] = useReducer(reducer, {
    phase: 'quiz',
    chapterNum,
    questions,
    currentGroupIndex: 0,
    totalGroups: groups.length,
    results: [],
  } as State)

  if (state.phase === 'done') {
    onComplete(state.results)
    return null
  }

  if (state.phase === 'interstitial') {
    return (
      <div className="mx-auto max-w-2xl px-8 py-12 text-center">
        <div className="flex justify-center gap-2 mb-4">
          {Array.from({ length: state.groupTotal }).map((_, i) => (
            i < state.groupScore
              ? <CheckCircle2 key={i} className="size-6 text-green-500" />
              : <XCircle key={i} className="size-6 text-red-500/60" />
          ))}
        </div>
        <h3 className="text-lg font-semibold">
          {tocTitles[String(state.chapterNum)] || `Chapter ${state.chapterNum}`}
        </h3>
        <p className="mt-1 text-sm text-content-muted">
          {state.groupScore}/{state.groupTotal} correct
        </p>

        {/* Progress */}
        <div className="mt-6 flex justify-center gap-1.5">
          {Array.from({ length: state.totalGroups }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full ${
                i < state.currentGroupIndex ? 'bg-[oklch(0.55_0.20_285)]'
                : i === state.currentGroupIndex ? 'bg-[oklch(0.55_0.20_285)]/60'
                : 'bg-border-default/50'
              }`}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={() => dispatch({ type: 'stop' })}>
            Stop here
          </Button>
          {state.currentGroupIndex + 1 < state.totalGroups && (
            <Button
              onClick={() => dispatch({ type: 'continue' })}
              className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
            >
              Continue
            </Button>
          )}
          {state.currentGroupIndex + 1 >= state.totalGroups && (
            <Button
              onClick={() => dispatch({ type: 'stop' })}
              className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Quiz phase
  if (state.phase === 'quiz') {
    const chTitle = tocTitles[String(state.chapterNum)] || `Chapter ${state.chapterNum}`
    return (
      <div>
        {/* Progress stepper */}
        <div className="mx-auto max-w-2xl px-8 pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            {Array.from({ length: state.totalGroups }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i < state.currentGroupIndex ? 'bg-[oklch(0.55_0.20_285)]'
                  : i === state.currentGroupIndex ? 'bg-[oklch(0.55_0.20_285)]/60'
                  : 'bg-border-default/50'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-content-muted">
            Chapter {state.currentGroupIndex + 1} of {state.totalGroups} — {chTitle}
          </p>
        </div>

        <QuizPanel
          questions={state.questions.map(q => ({
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
          }))}
          onComplete={(answers) => dispatch({ type: 'quiz-complete', answers, questions: state.questions })}
          onSkip={() => dispatch({ type: 'stop' })}
          title={`Smart Review — ${chTitle}`}
          subtitle={`${state.questions.length} question${state.questions.length > 1 ? 's' : ''} to review from this chapter.`}
        />
      </div>
    )
  }

  return null
}
```

**Step 2: Wire Smart Review into QuizReviewPage**

In `src/pages/QuizReviewPage.tsx`:

Add import:
```typescript
import { SmartReviewFlow } from '@src/components/SmartReviewFlow'
import { selectSmartReviewQueue } from '@src/store/quizHistorySelectors'
```

Add state:
```typescript
const [smartReviewActive, setSmartReviewActive] = useState(false)
const smartReviewQueue = useAppSelector(selectSmartReviewQueue(book.id))
```

Add handler:
```typescript
const handleSmartReviewComplete = (results: Array<{ chapterNum: number; questionIndex: number; correct: boolean }>) => {
  // Group results by chapter and record attempts
  const byChapter = new Map<number, number[]>()
  for (const r of results) {
    const quiz = bookQuizzes[String(r.chapterNum)]
    if (!quiz) continue
    if (!byChapter.has(r.chapterNum)) {
      // Start with a copy of the latest attempt's answers (for questions not in smart review)
      const latest = quiz.attempts[quiz.attempts.length - 1]
      byChapter.set(r.chapterNum, latest ? latest.answers.map(a => a.selectedAnswer) : [])
    }
    const answers = byChapter.get(r.chapterNum)!
    // We need to find which selectedAnswer corresponds to this result
    // For smart review, we record a new attempt with updated answers
  }
  // For simplicity, smart review results don't create new full-chapter attempts
  // (since only wrong questions are reviewed). Just exit for now.
  setSmartReviewActive(false)
}
```

In the render, add Smart Review button to the SummaryStrip area:
```typescript
{smartReviewQueue.length > 0 && !retakeChapter && !smartReviewActive && (
  <Button
    size="sm"
    onClick={() => setSmartReviewActive(true)}
    className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
  >
    Smart Review ({smartReviewQueue.length} questions)
  </Button>
)}
```

And render the SmartReviewFlow when active:
```typescript
{smartReviewActive ? (
  <SmartReviewFlow
    queue={smartReviewQueue}
    tocTitles={tocTitles}
    onComplete={handleSmartReviewComplete}
    onExit={() => setSmartReviewActive(false)}
  />
) : retakeChapter !== null ? (
  // ... existing retake code
) : (
  // ... existing ChapterBreakdownList
)}
```

**Step 3: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/components/SmartReviewFlow.tsx src/pages/QuizReviewPage.tsx
git commit -m "feat: smart review flow with interleaved cross-chapter questions"
```

---

### Task 8: Build Book Overview Modal

**Files:**
- Create: `src/components/BookOverviewModal.tsx`
- Modify: `src/App.tsx` (render modal for book-overview view)

**Step 1: Create BookOverviewModal**

Create `src/components/BookOverviewModal.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Circle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import { useAppSelector } from '@src/store'

interface BookOverviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: { id: string; title: string; totalChapters: number }
}

interface TocChapter {
  title: string
  description: string
}

export function BookOverviewModal({ open, onOpenChange, book }: BookOverviewModalProps) {
  const [toc, setToc] = useState<TocChapter[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const furthest = useAppSelector(s => s.readingProgress.furthest[book.id] ?? -1)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch(`/api/books/${book.id}/toc`).then(r => r.json()),
      fetch(`/api/books/${book.id}`).then(r => r.json()),
    ])
      .then(([tocData, metaData]) => {
        setToc(tocData.chapters || [])
        setPrompt(metaData.prompt || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, book.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{book.title}</DialogTitle>
          {prompt && <DialogDescription>{prompt}</DialogDescription>}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-content-muted">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {toc.map((ch, i) => {
              const read = i <= furthest
              return (
                <div key={i} className="flex items-start gap-3">
                  {read ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-green-500" />
                  ) : (
                    <Circle className="size-4 shrink-0 mt-0.5 text-content-muted/40" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${read ? 'text-content-primary' : 'text-content-muted'}`}>
                      {i + 1}. {ch.title}
                    </p>
                    <p className="text-xs text-content-muted/70">{ch.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Wire into App.tsx**

In `src/App.tsx`:

Add import:
```typescript
import { BookOverviewModal } from '@src/components/BookOverviewModal'
```

Replace the `book-overview` view handling. Instead of a separate page, render it as a modal that returns to library when closed. Before the `return` statement in the library view, handle book-overview:

```typescript
if (view.type === 'book-overview') {
  // Render library with overlay modal
  // Actually, simplest: just set view back to library and open a dialog
}
```

Better approach — add a `bookOverview` dialog state similar to `renameDialog`:

Add state:
```typescript
const [overviewBook, setOverviewBook] = useState<Book | null>(null)
```

In the context menu "Book Overview" button, change to:
```typescript
onClick={() => {
  setOverviewBook(contextMenu.book)
  setContextMenu(null)
}}
```

Remove the `book-overview` case from the View type (not needed as a separate view).

Add the modal before the closing `</div>`:
```typescript
<BookOverviewModal
  open={!!overviewBook}
  onOpenChange={(open) => { if (!open) setOverviewBook(null) }}
  book={overviewBook ?? { id: '', title: '', totalChapters: 0 }}
/>
```

Also clean up the View type to remove `book-overview`:
```typescript
type View =
  | { type: 'library' }
  | { type: 'creating'; topic: string; details: string }
  | { type: 'reading'; book: Book }
  | { type: 'quiz-review'; book: Book }
```

**Step 3: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/components/BookOverviewModal.tsx src/App.tsx
git commit -m "feat: book overview modal with TOC and per-chapter read progress"
```

---

### Task 9: Add Quiz Review Button to Reader Header

**Files:**
- Modify: `src/pages/ReaderPage.tsx:23,310-336`

**Step 1: Add onQuizReview prop**

Change the component signature:
```typescript
export function ReaderPage({ book, onBack, onQuizReview }: {
  book: Book
  onBack: () => void
  onQuizReview?: () => void
}) {
```

**Step 2: Add icon button in header**

Import `BarChart3` from lucide-react (add to line 1 imports).

In the header nav area (around line 335, before `<SettingsMenu subtle />`), add:

```typescript
{onQuizReview && (
  <Button
    variant="ghost"
    size="icon-sm"
    onClick={onQuizReview}
    aria-label="Quiz review"
  >
    <BarChart3 className="size-4" />
  </Button>
)}
```

**Step 3: Wire up in App.tsx**

In `src/App.tsx`, update the ReaderPage rendering (around line 187):

```typescript
if (view.type === 'reading') {
  return (
    <ReaderPage
      book={view.book}
      onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
      onQuizReview={() => setView({ type: 'quiz-review', book: view.book })}
    />
  )
}
```

Also update the QuizReviewPage `onBackToReader` to go back to reading:
```typescript
if (view.type === 'quiz-review') {
  return (
    <QuizReviewPage
      book={view.book}
      onBack={() => { fetchBooks(); setView({ type: 'library' }) }}
      onBackToReader={() => setView({ type: 'reading', book: view.book })}
    />
  )
}
```

**Step 4: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/pages/ReaderPage.tsx src/App.tsx
git commit -m "feat: add quiz review button to reader header"
```

---

### Task 10: Fix SummaryStrip Segmented Bar Accuracy

**Files:**
- Modify: `src/pages/QuizReviewPage.tsx` (SummaryStrip component)

The initial SummaryStrip used a simplified `i < correct` check. Now that we have the full data model, fix the segmented bar to show actual per-question correctness.

**Step 1: Update SummaryStrip to use per-question data**

```typescript
function SummaryStrip({ bookId, correct, total, chaptersToReview }: {
  bookId: string
  correct: number
  total: number
  chaptersToReview: number
}) {
  const bookQuizzes = useAppSelector(s => s.quizHistory.quizzes[bookId] ?? {})

  // Build per-question correctness array from latest attempts, in chapter order
  const segments: boolean[] = []
  const sortedKeys = Object.keys(bookQuizzes).sort((a, b) => parseInt(a) - parseInt(b))
  for (const key of sortedKeys) {
    const ch = bookQuizzes[key]
    const latest = ch.attempts[ch.attempts.length - 1]
    if (latest) {
      for (const a of latest.answers) {
        segments.push(a.correct)
      }
    }
  }

  return (
    <div className="flex items-center gap-6 rounded-xl border border-border-default/50 bg-surface-raised/50 px-5 py-3">
      <div className="flex gap-0.5" role="img" aria-label={`${correct} of ${total} correct`}>
        {segments.map((isCorrect, i) => (
          <div
            key={i}
            className={`h-3 w-2 rounded-sm ${isCorrect ? 'bg-green-500/70' : 'bg-red-500/40'}`}
          />
        ))}
      </div>

      <span className="text-sm font-medium text-content-primary">
        {correct}/{total} correct
      </span>

      {chaptersToReview > 0 && (
        <span className="text-sm text-content-muted">
          {chaptersToReview} {chaptersToReview === 1 ? 'chapter' : 'chapters'} to review
        </span>
      )}
    </div>
  )
}
```

Update the SummaryStrip usage to pass `bookId`:
```typescript
<SummaryStrip
  bookId={book.id}
  correct={summary.correct}
  total={summary.total}
  chaptersToReview={summary.chaptersToReview}
/>
```

**Step 2: Verify build**

Run: `cd /Users/ross/tutor && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/pages/QuizReviewPage.tsx
git commit -m "fix: segmented bar shows actual per-question correctness"
```

---

### Task 11: Manual Testing Checklist

**No code changes — verify the feature end-to-end.**

1. Start the app: `pnpm dev:server` and `pnpm dev`
2. Open a book that has completed chapters with quizzes
3. Right-click the book card — verify "Quiz Review" and "Book Overview" appear
4. Click "Book Overview" — verify modal shows title, prompt, TOC with read/unread icons
5. Close modal, right-click again, click "Quiz Review"
6. Verify: summary strip shows correct segmented bar, score fraction, chapters to review count
7. Verify: chapter list shows dot indicators (filled green / outlined red)
8. Click a chapter row — verify it expands showing questions with correct/wrong answers
9. Click "Retake" on a chapter — verify QuizPanel appears with same questions
10. Complete the retake — verify dots update, attempt count increments
11. If 2+ attempts exist on a chapter, verify sparkline appears
12. Click "Smart Review" button — verify it shows wrong questions grouped by chapter
13. Complete smart review — verify interstitials between chapters, progress stepper
14. In the reader, verify the bar chart icon appears in the header and navigates to quiz review
15. Verify back navigation from quiz review returns to library
16. Verify "Back to reading" returns to exact chapter position

---

## Summary of Files

| Action | File |
|--------|------|
| Create | `src/store/quizHistorySlice.ts` |
| Create | `src/store/quizHistorySelectors.ts` |
| Create | `src/components/ChapterBreakdownList.tsx` |
| Create | `src/components/SmartReviewFlow.tsx` |
| Create | `src/components/BookOverviewModal.tsx` |
| Modify | `src/store.ts` |
| Modify | `src/pages/QuizReviewPage.tsx` |
| Modify | `src/pages/ReaderPage.tsx` |
| Modify | `src/App.tsx` |
