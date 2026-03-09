import { Button } from '@src/components/ui/button'
import { StarRating } from '@src/components/StarRating'
import { BookOpen, Award } from 'lucide-react'

interface BookCompleteSummaryProps {
  title: string
  totalChapters: number
  rating: number
  finalQuizScore: number
  finalQuizTotal: number
  onUpdateProfile: () => void
  onSkip: () => void
}

export function BookCompleteSummary({
  title,
  totalChapters,
  rating,
  finalQuizScore,
  finalQuizTotal,
  onUpdateProfile,
  onSkip,
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

        <div className="mt-10 flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={onUpdateProfile}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            Update Learning Profile
          </Button>
          <button
            onClick={onSkip}
            className="text-sm text-content-muted/70 underline underline-offset-2 hover:text-content-muted"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
