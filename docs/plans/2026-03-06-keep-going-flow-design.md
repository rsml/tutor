# Keep Going Flow: Quiz, Feedback, and Chapter Generation

## Overview

When the reader reaches the last generated chapter, a "Keep Going" button appears. Tapping it starts a linear flow: Quiz -> Feedback -> Stream next chapter. Each step replaces the content area inside ReaderPage.

## State Machine

ReaderPage gains a `phase` state:

```
reading -> [Keep Going] -> quiz -> [Reveal -> OK | Skip] -> feedback -> [Submit] -> generating -> reading
```

- `reading`: Normal chapter view. "Keep Going" shown at bottom when `chapterIndex + 1 === generatedUpTo`.
- `quiz`: 3 multiple-choice questions about the current chapter. Pre-generated alongside the chapter.
- `feedback`: Two text areas — "What worked well?" / "What could be better?". Submit saves feedback and triggers generation.
- `generating`: SSE streaming view showing next chapter markdown appearing in real-time. When done, auto-transitions to `reading` on the new chapter.

## Backend

### Modified: Chapter generation includes quiz

Whenever a chapter is generated (creation flow or generate-next), immediately after the chapter content, generate 3 quiz questions via `generateObject()` with the Zod schema. Save quiz to `books/{id}/quiz/{NN}.yml`.

Quiz stored separately from feedback so it can be fetched before feedback exists.

### New endpoint: `GET /api/books/:id/chapters/:num/quiz`

Returns `{ questions: QuizQuestion[] }` from the pre-generated quiz file.

### New endpoint: `POST /api/books/:id/chapters/:num/feedback`

Body: `{ liked?: string, disliked?: string, quizAnswers: number[] }`

Saves to `books/{id}/feedback/{NN}.yml` using existing FeedbackSchema.

### New endpoint: `POST /api/books/:id/generate-next`

Body: `{ apiKey, model, provider }`

SSE streaming response. Steps:
1. Read book meta, TOC, all prior feedback
2. Build chapter prompt incorporating feedback + quiz results from previous chapters
3. Stream chapter N+1 content
4. Generate quiz for chapter N+1 via `generateObject()`
5. Save chapter + quiz, update `generatedUpTo`
6. Send `done` event

### Modified: `POST /api/books` (creation)

After streaming chapter 1, also generate and save quiz for chapter 1.

## Frontend Components

### QuizPanel

Props: `questions: QuizQuestion[], onComplete: (answers: number[]) => void, onSkip: () => void`

States: `answering | revealed`

- `answering`: Radio buttons for each question. "Skip" and "Reveal" buttons at bottom.
- `revealed`: Correct answers highlighted green, wrong answers red. Shows score "2/3". "Skip" disappears. "Reveal" becomes "OK". Click "OK" calls `onComplete(answers)`.

### FeedbackForm

Props: `onSubmit: (liked: string, disliked: string) => void`

Two text areas with labels. Submit button.

### GeneratingOverlay (inline, not a separate page)

Reuses the ReactMarkdown + SSE reader pattern from CreationView. Reads the streaming response from `POST /api/books/:id/generate-next`, renders markdown in real-time. When `done` event arrives, calls a callback to transition ReaderPage to `reading` on the new chapter.

### ReaderPage changes

- Fetch `generatedUpTo` from book meta to know when to show "Keep Going"
- `phase` state drives which component renders in the content area
- "Keep Going" button at the bottom of chapter content (only on last generated chapter)
- Chapter nav arrows work normally for all generated chapters regardless of phase

## Data stored per chapter

```
books/{id}/
  chapters/01.md        # chapter markdown
  quiz/01.yml           # { questions: QuizQuestion[] }
  feedback/01.yml       # { chapter, feedback: {liked, disliked}, quiz: {questions, score} }
```

Quiz and feedback are separate files. Quiz is written at generation time. Feedback is written when the user submits it.
