import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@src/components/ui/button'
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
                        {answer.correct ? (
                          <p className="mt-1 text-xs text-green-400">
                            {q.options[q.correctIndex]}
                          </p>
                        ) : (
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
    <svg width={width} height={height} className="shrink-0" role="img" aria-label={`Score trend: ${scores.join(', ')}`}>
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
