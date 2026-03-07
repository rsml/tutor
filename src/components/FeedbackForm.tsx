import { useState } from 'react'
import { Button } from '@src/components/ui/button'

interface FeedbackFormProps {
  chapterNum: number
  onSubmit: (liked: string, disliked: string) => void
  submitLabel?: string
}

export function FeedbackForm({ chapterNum, onSubmit, submitLabel }: FeedbackFormProps) {
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
          {submitLabel ?? 'Generate Next Chapter'}
        </Button>
      </div>
    </div>
  )
}
