import { useState } from 'react'
import { Button } from '@src/components/ui/button'
import { useAppSelector, selectReadingWidth } from '@src/store'

interface FeedbackFormProps {
  chapterNum: number
  onSubmit: (liked: string, disliked: string) => void
  submitLabel?: string
}

export function FeedbackForm({ chapterNum, onSubmit, submitLabel }: FeedbackFormProps) {
  const readingWidth = useAppSelector(selectReadingWidth)
  const [liked, setLiked] = useState('')
  const [disliked, setDisliked] = useState('')

  return (
    <div className="mx-auto px-8 py-8" style={{ maxWidth: readingWidth }}>
      <h2 className="text-xl font-semibold tracking-tight">Chapter {chapterNum} Feedback</h2>
      <p className="mt-1 text-sm text-content-muted">
        {submitLabel ? 'Your feedback helps improve future books.' : 'Your feedback shapes how the next chapter is written.'}
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
            className="mt-2 w-full rounded-lg border border-border-default/50 bg-surface-raised px-4 py-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
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
            className="mt-2 w-full rounded-lg border border-border-default/50 bg-surface-raised px-4 py-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          variant="primary"
          size="lg"
          onClick={() => onSubmit(liked, disliked)}
          className="font-semibold"
        >
          {submitLabel ?? 'Generate Next Chapter'}
        </Button>
      </div>
    </div>
  )
}
