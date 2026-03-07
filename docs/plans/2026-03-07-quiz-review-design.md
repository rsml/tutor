# Quiz Review & Retake Feature — Design Document

## Overview

Add quiz review, retake, and performance tracking to the adaptive learning book app. Users can review quiz performance across all chapters, retake quizzes to improve retention, and see their improvement over time through progressive visualization.

## Entry Points

1. **Right-click context menu** on book cards — new "Quiz Review" and "Book Overview" options
2. **Icon button** in ReaderPage header bar (alongside settings gear)
3. Return navigation preserves reader state (chapter position, scroll progress) for instant return

## Page Structure

New view type: `{ type: 'quiz-review'; book: Book }` in `App.tsx`, following the existing `View` discriminated union pattern.

### Layout

#### Header Bar
- Back arrow — returns to reader (or library if entered from context menu)
- Book title
- Sort toggle: "Weakest first" (default) | "Chapter order"

#### Summary Strip (~60px)
- Segmented bar: one segment per question across all chapters (filled = correct, outlined = wrong)
- Overall score as fraction (e.g., "28/36 correct")
- Count of chapters with any wrong answers (e.g., "3 chapters to review")
- "Smart Review" button

#### Chapter Breakdown List (primary content)

Each chapter row shows:
- Chapter number and title
- 3-dot indicator: filled circle = correct, outlined circle = wrong
- "Retake" button (inline, right side)

Expanding a chapter row reveals:
- Each question with user's answer and correct answer
- Correct answers marked with checkmark icon + green
- Wrong answers marked with X icon + red
- After 2+ attempts: sparkline showing score trajectory across attempts

### Retake Flow

**Single chapter:**
- Click "Retake" on a chapter row
- QuizPanel renders in main content area (replacing the list)
- Same original questions, answers cleared
- On completion: new attempt recorded in Redux, returns to list with updated indicators

**Smart Review (cross-chapter):**
- Collects all wrong questions across chapters, interleaved
- Progress stepper: "Question 3 of 8 - Chapter 5"
- After each chapter's questions: interstitial card with score + "Continue" / "Stop here"
- Each completed chapter's attempt written to Redux at the interstitial
- Local `useReducer` manages flow state; Redux only gets completed attempts

### Context Menu Additions

Existing menu (Rename, Delete) gets:
- **Book Overview** — shows topic/prompt, TOC with chapter titles, per-chapter read progress
- **Quiz Review** — navigates to the quiz review page

## Data Model (Redux)

### New `quizHistorySlice`

```typescript
interface QuizQuestion {
  question: string
  options: string[]        // always 4
  correctIndex: number     // 0-3
}

interface QuizAttempt {
  attemptNumber: number    // 1, 2, 3...
  timestamp: string        // ISO string
  answers: Array<{
    selectedAnswer: number // 0-3
    correct: boolean       // pre-computed for selector performance
  }>
  score: number            // 0-3
}

interface ChapterQuiz {
  questions: QuizQuestion[] // source of truth, stored once
  attempts: QuizAttempt[]   // grows with each retake
}

interface QuizHistoryState {
  quizzes: Record<string, Record<string, ChapterQuiz>>
  // bookId -> chapterNum (string) -> ChapterQuiz
}
```

First attempt auto-populated when user completes a quiz during normal reading flow. Retakes append new `QuizAttempt` entries.

### Reselect Selectors

- `selectChaptersNeedingReview(bookId)` — chapters where latest attempt has any wrong answers
- `selectPerQuestionCorrectRate(bookId)` — per-question stats across all attempts
- `selectChapterSparkline(bookId, chapterNum)` — array of scores for sparkline rendering
- `selectSmartReviewQueue(bookId)` — all wrong questions, interleaved across chapters
- `selectOverallScore(bookId)` — total correct / total questions across latest attempts
- `selectBookQuizSummary(bookId)` — composite selector for summary strip

### Migration

The existing `chapterDataSlice.quizResults` is replaced by the new `quizHistorySlice`. The reader flow is updated to write to the new slice, populating both `questions` and the first `QuizAttempt`.

## Progressive Disclosure

| Data state | What shows |
|---|---|
| No quizzes taken | Empty state: "Complete chapter quizzes to see your review" |
| Single attempt per chapter | 3-dot indicators, expandable questions, retake buttons |
| 2+ attempts on some chapters | Sparklines appear on those chapters |
| Many retakes | Smart Review becomes most useful, sparklines show trajectory |

## Accessibility

- Icons (checkmark, X, warning) alongside colors — never color alone (WCAG 2.1 SC 1.4.1)
- `aria-label` on dot indicators (e.g., "2 of 3 correct")
- Keyboard navigation through chapter list and expanded questions
- Focus management when entering/exiting retake flow

## Design Decisions

1. **No landing screen** — unified view with analytics and action co-located (validated through expert debate)
2. **Dedicated page, not in-reader** — reader is already complex with 4 phases; separate view avoids state explosion
3. **No charts initially** — 3 questions per chapter means dots ARE the visualization; sparklines appear progressively with retake data
4. **Questions are the primary content** — not stat cards or dashboards; specific gaps matter more than aggregate scores
5. **Redux-only storage** — no server-side changes; quiz history persists via redux-persist
6. **Reuse QuizPanel** — same component for retakes, preserving interaction consistency
