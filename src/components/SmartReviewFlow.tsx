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
  onComplete: () => void
  onExit: () => void
}

interface QuizPhase {
  phase: 'quiz'
  chapterNum: number
  questions: ReviewQuestion[]
  groupIndex: number
  totalGroups: number
}

interface InterstitialPhase {
  phase: 'interstitial'
  chapterNum: number
  groupScore: number
  groupTotal: number
  groupIndex: number
  totalGroups: number
}

type State = QuizPhase | InterstitialPhase | { phase: 'done' }

type Action =
  | { type: 'quiz-complete'; answers: number[]; questions: ReviewQuestion[] }
  | { type: 'continue' }
  | { type: 'stop' }

function groupByChapter(queue: ReviewQuestion[]): Array<[number, ReviewQuestion[]]> {
  const groups = new Map<number, ReviewQuestion[]>()
  for (const q of queue) {
    const arr = groups.get(q.chapterNum) || []
    arr.push(q)
    groups.set(q.chapterNum, arr)
  }
  return Array.from(groups.entries())
}

export function SmartReviewFlow({ queue, tocTitles, onComplete, onExit }: SmartReviewProps) {
  const groups = groupByChapter(queue)

  function reducer(state: State, action: Action): State {
    if (action.type === 'stop') return { phase: 'done' }

    if (action.type === 'quiz-complete' && state.phase === 'quiz') {
      const score = action.answers.filter((a, i) => a === action.questions[i].correctIndex).length
      return {
        phase: 'interstitial',
        chapterNum: state.chapterNum,
        groupScore: score,
        groupTotal: action.questions.length,
        groupIndex: state.groupIndex,
        totalGroups: state.totalGroups,
      }
    }

    if (action.type === 'continue' && state.phase === 'interstitial') {
      const nextIdx = state.groupIndex + 1
      if (nextIdx >= state.totalGroups) return { phase: 'done' }
      const [chapterNum, questions] = groups[nextIdx]
      return {
        phase: 'quiz',
        chapterNum,
        questions,
        groupIndex: nextIdx,
        totalGroups: state.totalGroups,
      }
    }

    return state
  }

  const [chapterNum, questions] = groups[0] || [0, []]
  const [state, dispatch] = useReducer(reducer, {
    phase: 'quiz',
    chapterNum,
    questions,
    groupIndex: 0,
    totalGroups: groups.length,
  } as State)

  if (state.phase === 'done') {
    onComplete()
    return null
  }

  const ProgressDots = ({ current, total }: { current: number; total: number }) => (
    <div className="flex justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-6 rounded-full ${
            i < current ? 'bg-[oklch(0.55_0.20_285)]'
            : i === current ? 'bg-[oklch(0.55_0.20_285)]/60'
            : 'bg-border-default/50'
          }`}
        />
      ))}
    </div>
  )

  if (state.phase === 'interstitial') {
    const isLast = state.groupIndex + 1 >= state.totalGroups
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

        <div className="mt-6">
          <ProgressDots current={state.groupIndex + 1} total={state.totalGroups} />
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={() => dispatch({ type: 'stop' })}>
            Stop here
          </Button>
          <Button
            onClick={() => dispatch({ type: isLast ? 'stop' : 'continue' })}
            className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
          >
            {isLast ? 'Done' : 'Continue'}
          </Button>
        </div>
      </div>
    )
  }

  if (state.phase === 'quiz') {
    const chTitle = tocTitles[String(state.chapterNum)] || `Chapter ${state.chapterNum}`
    return (
      <div>
        <div className="mx-auto max-w-2xl px-8 pt-4">
          <ProgressDots current={state.groupIndex} total={state.totalGroups} />
          <p className="mt-2 text-center text-xs text-content-muted">
            Group {state.groupIndex + 1} of {state.totalGroups} — {chTitle}
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
