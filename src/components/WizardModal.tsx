import { useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, ChevronDown, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
import { useAppSelector, selectModel, selectActiveProvider, selectHasApiKey } from '@src/store'
import { apiUrl } from '@src/lib/api-base'
import { store } from '@src/store'

interface WizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (topic: string, details: string) => void
}

export function WizardModal({ open, onOpenChange, onCreate }: WizardModalProps) {
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)
  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)
  const hasApiKey = useAppSelector(selectHasApiKey)

  const handleCreate = () => {
    if (!topic.trim()) return
    onOpenChange(false)
    onCreate(topic.trim(), details.trim())
    setTopic('')
    setDetails('')
    setReasoning(null)
  }

  const handleSuggest = async () => {
    if (!hasApiKey || suggesting) return
    setSuggesting(true)
    setReasoning(null)

    try {
      const state = store.getState()
      const quizHistory = state.quizHistory?.quizzes ?? undefined

      const res = await fetch(apiUrl('/api/books/suggest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider, quizHistory }),
      })

      if (!res.ok) throw new Error('Suggestion failed')

      const data = await res.json()
      setTopic(data.topic)
      setDetails(data.details)
      setDetailsOpen(true)
      if (data.reasoning) setReasoning(data.reasoning)
    } catch {
      toast.error('Failed to get suggestion — try again or type manually')
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Create a new book</DialogTitle>
              <DialogDescription>
                Tell us what you want to learn. We'll generate a personalized table of contents.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSuggest}
              disabled={!hasApiKey || suggesting}
              className="shrink-0 gap-1.5 text-xs text-content-muted hover:text-[oklch(0.55_0.20_285)]"
              title="Suggest a book based on your learning history"
            >
              {suggesting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Suggest
            </Button>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {reasoning && (
            <p className="text-xs text-content-muted italic leading-relaxed bg-surface-muted/50 rounded-md px-3 py-2">
              {reasoning}
            </p>
          )}

          <div className="grid gap-1.5">
            <label htmlFor="topic" className="text-sm font-medium text-content-primary">
              Topic
            </label>
            <input
              id="topic"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g., Machine Learning, Rust, CSS Architecture"
              className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
          </div>

          <div className="grid gap-1.5">
            <button
              type="button"
              onClick={() => setDetailsOpen(v => !v)}
              className="flex items-center gap-1 text-sm font-medium text-content-primary"
            >
              Details
              <span className="text-xs font-normal text-content-muted">(optional)</span>
              <ChevronDown className={`ml-auto size-4 text-content-muted transition-transform ${detailsOpen ? '' : '-rotate-90'}`} />
            </button>
            {detailsOpen && (
              <textarea
                id="details"
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Any specific areas to focus on, your experience level, or goals..."
                rows={4}
                className="resize-none rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            size="lg"
            disabled={!topic.trim()}
            onClick={handleCreate}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            <BookOpen data-icon="inline-start" className="size-4" />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
