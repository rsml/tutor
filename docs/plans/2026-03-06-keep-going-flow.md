# Keep Going Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add quiz, feedback, and streaming next-chapter generation to the reader — triggered by a "Keep Going" button on the last generated chapter.

**Architecture:** ReaderPage gains a `phase` state machine (reading → quiz → feedback → generating → reading). Quiz questions are pre-generated alongside each chapter on the backend. Feedback + quiz results inform the next chapter's generation prompt. Generation streams via SSE, same pattern as CreationView.

**Tech Stack:** React, Vercel AI SDK (`streamText` + `generateObject`), Zod schemas, SSE, Fastify

---

### Task 1: Add quiz storage to book-store

**Files:**
- Modify: `server/schemas.ts:75-96`
- Modify: `server/services/book-store.ts:110-127`

**Step 1: Add QuizSchema to schemas.ts**

Add a standalone quiz file schema (separate from FeedbackSchema) after the existing `QuizQuestionSchema`:

```typescript
export const QuizSchema = z.object({
  questions: z.array(QuizQuestionSchema),
})

export type Quiz = z.infer<typeof QuizSchema>
```

**Step 2: Add quiz read/write to book-store.ts**

Add import of `QuizSchema` and `Quiz` from schemas, then add these functions after the chapter functions:

```typescript
// --- Quiz ---

export async function getQuiz(bookId: string, chapterNum: number): Promise<Quiz> {
  const padded = String(chapterNum).padStart(2, '0')
  return readYaml(join(bookDir(bookId), 'quiz', `${padded}.yml`), QuizSchema)
}

export async function saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void> {
  QuizSchema.parse(quiz)
  const dir = join(bookDir(bookId), 'quiz')
  await mkdir(dir, { recursive: true })
  const padded = String(chapterNum).padStart(2, '0')
  await writeYaml(join(dir, `${padded}.yml`), quiz)
}

export async function quizExists(bookId: string, chapterNum: number): Promise<boolean> {
  const padded = String(chapterNum).padStart(2, '0')
  return existsSync(join(bookDir(bookId), 'quiz', `${padded}.yml`))
}
```

**Step 3: Commit**

```bash
git add server/schemas.ts server/services/book-store.ts
git commit -m "feat: add quiz storage schema and book-store functions"
```

---

### Task 2: Generate quiz alongside chapter 1 in creation flow

**Files:**
- Modify: `server/routes/books.ts:78-199`

**Step 1: Add generateObject import and QuizSchema import**

At the top of `books.ts`, add:

```typescript
import { streamText, generateObject } from 'ai'
import { QuizQuestionSchema } from '../schemas.js'
import { z } from 'zod'
```

**Step 2: Add quiz generation helper function**

Add this function before `bookRoutes`:

```typescript
async function generateQuiz(
  provider: string,
  apiKey: string,
  model: string,
  chapterContent: string,
): Promise<{ questions: Array<{ question: string; options: string[]; correctIndex: number }> }> {
  const result = await generateObject({
    model: createModelClient(provider, apiKey, model),
    schema: z.object({
      questions: z.array(z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
      })).length(3),
    }),
    prompt: `Based on this chapter content, generate exactly 3 multiple-choice quiz questions to test comprehension. Each question should have 4 options with exactly one correct answer.

Chapter content:
${chapterContent}`,
  })
  return result.object
}
```

**Step 3: Add quiz generation after chapter 1 save**

In the `POST /api/books` handler, after `await store.saveChapter(bookId, 1, chapterText)` (line ~174), add:

```typescript
      // Generate quiz for chapter 1
      try {
        const quiz = await generateQuiz(provider ?? 'anthropic', apiKey, model, chapterText)
        await store.saveQuiz(bookId, 1, quiz)
      } catch {
        // Quiz generation failure is non-fatal
      }
```

**Step 4: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: generate quiz questions alongside chapter 1 during book creation"
```

---

### Task 3: Add quiz and feedback API endpoints

**Files:**
- Modify: `server/routes/books.ts`

**Step 1: Add GET quiz endpoint**

Inside `bookRoutes`, add after the existing chapter GET:

```typescript
  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num/quiz',
    async (request) => {
      return store.getQuiz(request.params.id, parseInt(request.params.num))
    },
  )
```

**Step 2: Add POST feedback endpoint**

```typescript
  fastify.post<{
    Params: { id: string; num: string }
    Body: { liked?: string; disliked?: string; quizAnswers?: number[] }
  }>(
    '/api/books/:id/chapters/:num/feedback',
    async (request) => {
      const chapterNum = parseInt(request.params.num)
      const { liked, disliked, quizAnswers } = request.body

      // Load quiz to merge answers
      let questions: Array<{ question: string; options: string[]; correctIndex: number; userAnswer?: number; correct?: boolean }> = []
      let score = 0
      try {
        const quiz = await store.getQuiz(request.params.id, chapterNum)
        questions = quiz.questions.map((q, i) => {
          const userAnswer = quizAnswers?.[i]
          const correct = userAnswer === q.correctIndex
          if (correct) score++
          return { ...q, userAnswer, correct }
        })
      } catch {
        // No quiz exists
      }

      const feedback = {
        chapter: chapterNum,
        feedback: { liked, disliked },
        quiz: { questions, score },
      }
      await store.saveFeedback(request.params.id, chapterNum, feedback)
      return { ok: true }
    },
  )
```

**Step 3: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: add quiz GET and feedback POST endpoints"
```

---

### Task 4: Add generate-next SSE endpoint

**Files:**
- Modify: `server/routes/books.ts`

**Step 1: Add the generate-next endpoint**

Add inside `bookRoutes`:

```typescript
  fastify.post<{
    Params: { id: string }
    Body: { apiKey: string; model: string; provider?: string }
  }>('/api/books/:id/generate-next', async (request, reply) => {
    const { apiKey, model, provider } = request.body
    const bookId = request.params.id

    const meta = await store.getBook(bookId)
    const toc = await store.getToc(bookId)
    const nextNum = meta.generatedUpTo + 1

    if (nextNum > meta.totalChapters) {
      return reply.status(400).send({ error: 'All chapters already generated' })
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
      // Gather prior feedback for context
      const allFeedback = await store.getAllFeedback(bookId)
      const feedbackContext = allFeedback.map(fb => {
        const parts: string[] = []
        if (fb.feedback.liked) parts.push(`Liked: ${fb.feedback.liked}`)
        if (fb.feedback.disliked) parts.push(`Could improve: ${fb.feedback.disliked}`)
        if (fb.quiz.score !== undefined) {
          parts.push(`Quiz score: ${fb.quiz.score}/${fb.quiz.questions.length}`)
          const wrong = fb.quiz.questions.filter(q => q.correct === false)
          if (wrong.length > 0) {
            parts.push(`Struggled with: ${wrong.map(q => q.question).join('; ')}`)
          }
        }
        return `Chapter ${fb.chapter}: ${parts.join('. ')}`
      }).join('\n')

      const chapterInfo = toc.chapters[nextNum - 1]

      // Read previous chapter for continuity
      let prevChapterContent = ''
      try {
        prevChapterContent = await store.getChapter(bookId, nextNum - 1)
      } catch { /* first chapter */ }

      let chapterText = ''
      const chapterResult = streamText({
        model: createModelClient(provider ?? 'anthropic', apiKey, model),
        system: `You are writing a chapter for a personalized learning book. Write an engaging, clear chapter approximately 1,500 words long.

Use markdown formatting:
- Start with # heading for the chapter title
- Use ## and ### for sections
- Bold and italic for emphasis
- Bullet/numbered lists where appropriate
- Code blocks with language tags where relevant
- > blockquotes for key insights or memorable takeaways

Write in a conversational but knowledgeable tone. Use concrete examples and real-world analogies. Make complex ideas accessible without being condescending.

${feedbackContext ? `\nReader feedback from previous chapters:\n${feedbackContext}\n\nAdapt your writing based on this feedback. If the reader struggled with quiz questions, briefly recap those concepts. If they liked certain approaches, lean into those.` : ''}`,
        prompt: `Book: ${meta.title}
Topic: ${meta.prompt}

This is Chapter ${nextNum} of ${meta.totalChapters}.
Chapter title: ${chapterInfo.title}
Chapter description: ${chapterInfo.description}

${prevChapterContent ? `Previous chapter ended with:\n${prevChapterContent.slice(-500)}` : ''}

Write this chapter now.`,
      })

      for await (const chunk of chapterResult.textStream) {
        chapterText += chunk
        send({ type: 'chapter', text: chunk })
      }

      await store.saveChapter(bookId, nextNum, chapterText)

      // Generate quiz
      try {
        const quiz = await generateQuiz(provider ?? 'anthropic', apiKey, model, chapterText)
        await store.saveQuiz(bookId, nextNum, quiz)
      } catch {
        // Quiz generation failure is non-fatal
      }

      meta.generatedUpTo = nextNum
      if (nextNum >= meta.totalChapters) {
        meta.status = 'complete'
      }
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)

      send({ type: 'done', chapterNum: nextNum })
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof Error ? error.message : 'Generation failed',
      })
    }

    reply.raw.end()
  })
```

**Step 2: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: add generate-next SSE endpoint with feedback-informed prompts"
```

---

### Task 5: Build QuizPanel component

**Files:**
- Create: `src/components/QuizPanel.tsx`

**Step 1: Create the component**

```tsx
import { useState } from 'react'
import { Button } from '@src/components/ui/button'
import { CheckCircle2, XCircle } from 'lucide-react'

interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

interface QuizPanelProps {
  questions: QuizQuestion[]
  onComplete: (answers: number[]) => void
  onSkip: () => void
}

export function QuizPanel({ questions, onComplete, onSkip }: QuizPanelProps) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null),
  )
  const [revealed, setRevealed] = useState(false)

  const allAnswered = answers.every(a => a !== null)
  const score = revealed
    ? answers.reduce((s, a, i) => s + (a === questions[i].correctIndex ? 1 : 0), 0)
    : 0

  const selectAnswer = (qIndex: number, optIndex: number) => {
    if (revealed) return
    setAnswers(prev => {
      const next = [...prev]
      next[qIndex] = optIndex
      return next
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h2 className="text-xl font-semibold tracking-tight">Quick Quiz</h2>
      <p className="mt-1 text-sm text-content-muted">
        Test your understanding of this chapter.
      </p>

      <div className="mt-8 space-y-8">
        {questions.map((q, qi) => (
          <div key={qi}>
            <p className="font-medium text-content-primary">
              {qi + 1}. {q.question}
            </p>
            <div className="mt-3 space-y-2">
              {q.options.map((opt, oi) => {
                const selected = answers[qi] === oi
                const isCorrect = q.correctIndex === oi
                let optClass =
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors'

                if (revealed) {
                  if (isCorrect) {
                    optClass += ' border-green-500/50 bg-green-500/10 text-green-400'
                  } else if (selected && !isCorrect) {
                    optClass += ' border-red-500/50 bg-red-500/10 text-red-400'
                  } else {
                    optClass += ' border-border-default/30 text-content-muted'
                  }
                } else if (selected) {
                  optClass +=
                    ' border-[oklch(0.55_0.20_285)] bg-[oklch(0.55_0.20_285)]/10 text-content-primary'
                } else {
                  optClass +=
                    ' border-border-default/50 text-content-secondary hover:border-border-default hover:bg-surface-muted/50'
                }

                return (
                  <div
                    key={oi}
                    className={optClass}
                    onClick={() => selectAnswer(qi, oi)}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-medium">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {revealed && isCorrect && (
                      <CheckCircle2 className="size-4 shrink-0 text-green-400" />
                    )}
                    {revealed && selected && !isCorrect && (
                      <XCircle className="size-4 shrink-0 text-red-400" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {revealed && (
        <p className="mt-6 text-center text-sm font-medium text-content-secondary">
          You got {score} of {questions.length} correct
        </p>
      )}

      <div className="mt-8 flex items-center justify-end gap-3">
        {!revealed && (
          <button
            onClick={onSkip}
            className="px-3 py-1.5 text-sm text-content-muted hover:text-content-secondary transition-colors"
          >
            Skip
          </button>
        )}
        {!revealed ? (
          <Button
            size="lg"
            disabled={!allAnswered}
            onClick={() => setRevealed(true)}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            Reveal
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={() => onComplete(answers as number[])}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            OK
          </Button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/QuizPanel.tsx
git commit -m "feat: add QuizPanel component with reveal/score flow"
```

---

### Task 6: Build FeedbackForm component

**Files:**
- Create: `src/components/FeedbackForm.tsx`

**Step 1: Create the component**

```tsx
import { useState } from 'react'
import { Button } from '@src/components/ui/button'

interface FeedbackFormProps {
  chapterNum: number
  onSubmit: (liked: string, disliked: string) => void
}

export function FeedbackForm({ chapterNum, onSubmit }: FeedbackFormProps) {
  const [liked, setLiked] = useState('')
  const [disliked, setDisliked] = useState('')

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h2 className="text-xl font-semibold tracking-tight">Chapter {chapterNum} Feedback</h2>
      <p className="mt-1 text-sm text-content-muted">
        Your feedback shapes how the next chapter is written.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-content-secondary">
            What worked well?
          </label>
          <textarea
            value={liked}
            onChange={e => setLiked(e.target.value)}
            placeholder="Examples, tone, depth, analogies..."
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-border-default/50 bg-surface-raised px-4 py-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-content-secondary">
            What could be better?
          </label>
          <textarea
            value={disliked}
            onChange={e => setDisliked(e.target.value)}
            placeholder="Too fast, too slow, confusing section..."
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-border-default/50 bg-surface-raised px-4 py-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          size="lg"
          onClick={() => onSubmit(liked, disliked)}
          className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
        >
          Generate Next Chapter
        </Button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/FeedbackForm.tsx
git commit -m "feat: add FeedbackForm component"
```

---

### Task 7: Wire up ReaderPage state machine

**Files:**
- Modify: `src/pages/ReaderPage.tsx`

This is the largest task. ReaderPage needs:
- `phase` state: `'reading' | 'quiz' | 'feedback' | 'generating'`
- `generatedUpTo` fetched from book meta
- "Keep Going" button at bottom of chapter when on last generated chapter
- Phase-based rendering in the content area
- SSE streaming for the `generating` phase

**Step 1: Add imports and state**

Replace the existing imports at top of ReaderPage.tsx:

```tsx
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@src/components/ui/button'
import { SelectionTooltip } from '@src/components/SelectionTooltip'
import { ChatPanel } from '@src/components/ChatPanel'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { QuizPanel } from '@src/components/QuizPanel'
import { FeedbackForm } from '@src/components/FeedbackForm'
import { useTextSelection } from '@src/hooks/useTextSelection'
import { useAppDispatch, useAppSelector, setChapterPosition, selectFontSize, selectApiKey, selectModel, selectActiveProvider } from '@src/store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
```

**Step 2: Add phase state and generatedUpTo**

Inside the component, after the existing state declarations, add:

```tsx
  type Phase = 'reading' | 'quiz' | 'feedback' | 'generating'
  const [phase, setPhase] = useState<Phase>('reading')
  const [generatedUpTo, setGeneratedUpTo] = useState(book.totalChapters) // assume all until loaded
  const [quizQuestions, setQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [streamingContent, setStreamingContent] = useState('')

  const apiKey = useAppSelector(selectApiKey)
  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)

  const isOnLastGenerated = chapterIndex + 1 === generatedUpTo && generatedUpTo < book.totalChapters
```

**Step 3: Fetch generatedUpTo from book meta**

```tsx
  useEffect(() => {
    fetch(`http://localhost:3147/api/books/${book.id}`)
      .then(res => res.json())
      .then(data => setGeneratedUpTo(data.generatedUpTo))
      .catch(() => {})
  }, [book.id])
```

**Step 4: Add "Keep Going" handler**

```tsx
  const handleKeepGoing = useCallback(async () => {
    // Fetch quiz for current chapter
    try {
      const res = await fetch(`http://localhost:3147/api/books/${book.id}/chapters/${chapterIndex + 1}/quiz`)
      if (res.ok) {
        const data = await res.json()
        if (data.questions?.length > 0) {
          setQuizQuestions(data.questions)
          setPhase('quiz')
          return
        }
      }
    } catch {}
    // No quiz available, go straight to feedback
    setPhase('feedback')
  }, [book.id, chapterIndex])
```

**Step 5: Add quiz complete and skip handlers**

```tsx
  const handleQuizComplete = useCallback((answers: number[]) => {
    setQuizAnswers(answers)
    setPhase('feedback')
  }, [])

  const handleQuizSkip = useCallback(() => {
    setQuizAnswers([])
    setPhase('feedback')
  }, [])
```

**Step 6: Add feedback submit handler with SSE streaming**

```tsx
  const handleFeedbackSubmit = useCallback(async (liked: string, disliked: string) => {
    // Save feedback
    try {
      await fetch(`http://localhost:3147/api/books/${book.id}/chapters/${chapterIndex + 1}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked, disliked, quizAnswers }),
      })
    } catch {}

    // Start generating next chapter
    setPhase('generating')
    setStreamingContent('')

    try {
      const res = await fetch(`http://localhost:3147/api/books/${book.id}/generate-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model, provider }),
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'chapter') {
              setStreamingContent(prev => prev + data.text)
            } else if (data.type === 'done') {
              const nextIndex = chapterIndex + 1
              setGeneratedUpTo(data.chapterNum)
              dispatch(setChapterPosition({ bookId: book.id, chapterIndex: nextIndex }))
              setPhase('reading')
              scrollRef.current?.scrollTo({ top: 0 })
            } else if (data.type === 'error') {
              setPhase('reading')
            }
          } catch {}
        }
      }
    } catch {
      setPhase('reading')
    }
  }, [book.id, chapterIndex, quizAnswers, apiKey, model, provider, dispatch, scrollRef])
```

**Step 7: Update the content area rendering**

Replace the `{/* Scrollable chapter content */}` main block with phase-based rendering:

```tsx
          {/* Scrollable chapter content */}
          <main
            ref={scrollRef}
            className="h-full overflow-y-auto"
          >
            <article ref={articleRef} style={{ fontSize: `${fontSize}px` }}>
              {phase === 'reading' && (
                <div className="mx-auto max-w-2xl px-8 pt-6 pb-24">
                  {chapterLoading ? (
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Loading chapter...</span>
                    </div>
                  ) : chapterContent ? (
                    <>
                      <div className="prose prose-neutral dark:prose-invert max-w-none leading-[1.8] text-content-secondary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapterContent}</ReactMarkdown>
                      </div>
                      {isOnLastGenerated && (
                        <div className="mt-12 flex justify-center">
                          <Button
                            size="lg"
                            onClick={handleKeepGoing}
                            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
                          >
                            Keep Going
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="pt-12 text-sm text-content-muted">
                      Chapter {chapterIndex + 1} hasn't been generated yet.
                    </p>
                  )}
                </div>
              )}

              {phase === 'quiz' && (
                <QuizPanel
                  questions={quizQuestions}
                  onComplete={handleQuizComplete}
                  onSkip={handleQuizSkip}
                />
              )}

              {phase === 'feedback' && (
                <FeedbackForm
                  chapterNum={chapterIndex + 1}
                  onSubmit={handleFeedbackSubmit}
                />
              )}

              {phase === 'generating' && (
                <div className="mx-auto max-w-2xl px-8 pt-6 pb-24">
                  {streamingContent ? (
                    <div className="prose prose-neutral dark:prose-invert max-w-none leading-[1.8] text-content-secondary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Generating chapter {chapterIndex + 2}...</span>
                    </div>
                  )}
                </div>
              )}
            </article>
          </main>
```

**Step 8: Reset phase when navigating chapters**

In the `goChapter` callback, add `setPhase('reading')`:

```typescript
  const goChapter = useCallback((delta: number) => {
    const next = chapterIndex + delta
    if (next >= 0 && next < book.totalChapters) {
      dispatch(setChapterPosition({ bookId: book.id, chapterIndex: next }))
      setPhase('reading')
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [chapterIndex, book.totalChapters, dispatch, book.id])
```

**Step 9: Commit**

```bash
git add src/pages/ReaderPage.tsx
git commit -m "feat: wire up Keep Going flow — quiz, feedback, streaming generation in reader"
```

---

### Task 8: Smoke test the full flow

**Step 1: Start both servers**

```bash
pnpm dev:server &
pnpm dev &
```

**Step 2: Create a new book and verify**

1. Create a book with any topic
2. Wait for TOC + Chapter 1 to generate
3. Open the book from library
4. Verify chapter 1 content renders (not boilerplate)
5. Scroll to bottom — "Keep Going" button should appear
6. Click "Keep Going" — quiz should appear with 3 questions
7. Answer all 3, click "Reveal" — see score, correct/wrong highlighted
8. Click "OK" — feedback form appears
9. Enter feedback, click "Generate Next Chapter"
10. Streaming markdown appears
11. When done, auto-navigates to chapter 2
12. Navigate back to chapter 1 — no "Keep Going" button (not on last generated)
13. Navigate to chapter 2 — "Keep Going" appears again

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete keep-going flow — quiz, feedback, adaptive chapter generation"
```
