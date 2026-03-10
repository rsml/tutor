import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
import { useAppSelector, selectFunctionModel, selectHasApiKey, selectDefaultChapterCount } from '@src/store'
import { apiUrl } from '@src/lib/api-base'
import { store } from '@src/store'

const CHAPTER_COUNTS = [1, 3, 6, 12, 25, 50]
const CHAPTER_LABELS = ['Essay', 'Short', 'Novella', 'Standard', 'Long', 'Epic']

interface WizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (topic: string, details: string, chapterCount: number, coverPrompt?: string) => void
}

export function WizardModal({ open, onOpenChange, onCreate }: WizardModalProps) {
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [generateCover, setGenerateCover] = useState(false)
  const [coverDescription, setCoverDescription] = useState('')
  const defaultChapterCount = useAppSelector(selectDefaultChapterCount)
  const [chapterCountIndex, setChapterCountIndex] = useState(() => {
    const idx = CHAPTER_COUNTS.indexOf(defaultChapterCount)
    return idx >= 0 ? idx : CHAPTER_COUNTS.indexOf(12)
  })
  const { provider, model } = useAppSelector(selectFunctionModel('profile'))
  const hasApiKey = useAppSelector(selectHasApiKey)

  // Reset chapter count when default changes or dialog opens
  useEffect(() => {
    if (open) {
      const idx = CHAPTER_COUNTS.indexOf(defaultChapterCount)
      setChapterCountIndex(idx >= 0 ? idx : CHAPTER_COUNTS.indexOf(12))
    }
  }, [open, defaultChapterCount])

  const handleCreate = () => {
    if (!topic.trim()) return
    onOpenChange(false)
    const coverPromptValue = generateCover
      ? (coverDescription.trim() || `Book cover for "${topic.trim()}": ${details.trim() || topic.trim()}. Clean, modern design with abstract imagery. No text on the cover.`)
      : undefined
    onCreate(topic.trim(), details.trim(), CHAPTER_COUNTS[chapterCountIndex], coverPromptValue)
    setTopic('')
    setDetails('')
    setReasoning(null)
    setGenerateCover(false)
    setCoverDescription('')
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
        <DialogHeader className="items-center">
          <DialogTitle className="text-xl">New Book</DialogTitle>
          <DialogDescription>
            What do you want to learn next?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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
                rows={6}
                className="resize-y rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            )}
          </div>

          {/* Generate cover checkbox */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="generate-cover"
              checked={generateCover}
              onChange={e => setGenerateCover(e.target.checked)}
              className="mt-0.5 accent-[oklch(0.55_0.20_285)]"
            />
            <div className="grid gap-1">
              <label htmlFor="generate-cover" className="text-sm font-medium text-content-primary cursor-pointer">
                Generate cover image
              </label>
              {generateCover && (
                <input
                  value={coverDescription}
                  onChange={e => setCoverDescription(e.target.value)}
                  placeholder="Describe the cover (optional — auto-generated if blank)"
                  className="h-8 rounded-lg border border-border-default bg-surface-raised px-2 text-xs text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
                />
              )}
            </div>
          </div>

          {/* Chapter count slider */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-content-primary">Length</span>
              <span className="text-xs text-content-muted">
                {CHAPTER_COUNTS[chapterCountIndex]} {CHAPTER_COUNTS[chapterCountIndex] === 1 ? 'chapter' : 'chapters'}
                <span className="ml-1.5 text-content-muted/60">{CHAPTER_LABELS[chapterCountIndex]}</span>
              </span>
            </div>
            <div className="relative px-1">
              <input
                type="range"
                min={0}
                max={CHAPTER_COUNTS.length - 1}
                value={chapterCountIndex}
                onChange={e => setChapterCountIndex(parseInt(e.target.value))}
                className="w-full accent-[oklch(0.55_0.20_285)] cursor-pointer"
              />
              <div className="flex justify-between px-2 -mt-0.5">
                {CHAPTER_COUNTS.map((count, i) => {
                  const isDefault = count === defaultChapterCount
                  return (
                    <div
                      key={count}
                      className={`relative flex flex-col items-center ${isDefault ? 'text-content-primary' : 'text-content-muted/40'}`}
                    >
                      <div className={`h-1.5 w-px ${isDefault ? 'bg-content-primary' : 'bg-content-muted/30'}`} />
                      <span className={`absolute top-2 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap ${isDefault ? '' : 'text-content-muted/50'}`}>
                        {CHAPTER_LABELS[i]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="lg"
            onClick={handleSuggest}
            disabled={!hasApiKey || suggesting}
            className="gap-1.5 text-[var(--color-ai)] hover:text-[var(--color-ai-hover)] hover:bg-[var(--color-ai)]/10"
            title="Suggest a book based on your learning history"
          >
            {suggesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Suggest
          </Button>
          <Button
            size="lg"
            disabled={!topic.trim()}
            onClick={handleCreate}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
