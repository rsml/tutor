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
    ? answers.reduce<number>((s, a, i) => s + (a === questions[i].correctIndex ? 1 : 0), 0)
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
