import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import { TickSlider } from '@src/components/ui/tick-slider'
import { useAppSelector, selectFunctionModel, selectHasApiKey, selectDefaultChapterCount } from '@src/store'
import { apiUrl } from '@src/lib/api-base'
import { store } from '@src/store'

const CHAPTER_COUNTS = [1, 3, 6, 12, 25, 50]
const CHAPTER_LABELS = ['Essay', 'Short', 'Novella', 'Standard', 'Long', 'Epic']

const COVER_STYLES = [
  'Minimalist pen-and-ink illustration on cream background, reminiscent of classic O\'Reilly animal covers',
  'Bold typographic cover with subtle geometric patterns, inspired by Penguin Classics design language',
  'Atmospheric watercolor composition with soft gradients, evoking literary fiction aesthetics',
  'Clean vector illustration with a limited 2-3 color palette, contemporary tech publishing style',
  'Photographic still life or detail study with dramatic lighting, premium non-fiction presentation',
  'Abstract geometric composition with muted earth tones, modernist academic press style',
  'Hand-drawn scientific or botanical illustration, scholarly naturalist aesthetic',
  'Textured linen background with elegant gold-foil-style accents, premium hardcover feel',
]

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
      ? (coverDescription.trim() || (() => {
          const style = COVER_STYLES[Math.floor(Math.random() * COVER_STYLES.length)]
          return `Elegant book cover. ${style}. Subject: ${details.trim() || topic.trim()}. Professional publishing quality, no text or lettering on the image.`
        })())
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
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader className="items-center text-center">
          <DialogTitle className="text-xl">New Book</DialogTitle>
          <DialogDescription>
            What do you want to learn next?
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

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
                rows={12}
                className="rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            )}
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
            <TickSlider
              min={0}
              max={CHAPTER_COUNTS.length - 1}
              value={chapterCountIndex}
              onChange={setChapterCountIndex}
              ticks={CHAPTER_COUNTS.map((count, i) => ({
                label: CHAPTER_LABELS[i],
                highlight: count === defaultChapterCount,
              }))}
            />
          </div>
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter className="justify-between">
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
            variant="primary"
            size="lg"
            disabled={!topic.trim()}
            onClick={handleCreate}
            className="font-semibold"
          >
            Create
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
