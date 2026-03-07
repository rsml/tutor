import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'

export function WizardModal({ trigger }: { trigger: React.ReactElement }) {
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(true)

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new book</DialogTitle>
          <DialogDescription>
            Tell us what you want to learn. We'll generate a personalized table of contents.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label htmlFor="topic" className="text-sm font-medium text-content-primary">
              Topic
            </label>
            <input
              id="topic"
              value={topic}
              onChange={e => setTopic(e.target.value)}
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
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            <BookOpen data-icon="inline-start" className="size-4" />
            Generate Table of Contents
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
