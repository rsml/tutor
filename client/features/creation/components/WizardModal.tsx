import { useState, useEffect } from 'react'
import { toast } from '@client/lib/toast'
import { Sparkles, Loader2, TrendingUp, Puzzle, Dices, Terminal } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@client/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@client/components/ui/dropdown-menu'
import { TickSlider } from '@client/components/ui/tick-slider'
import { useAppSelector, useAppDispatch, selectFunctionModel, selectHasApiKeyForFunction, selectDefaultChapterCount, selectAdvancedMode, setAdvancedMode } from '@client/store'
import { createSkeleton, getApiPort, suggestDetails, suggestTopic } from '@client/api'
import { generateMcpConfig } from '@client/lib/mcp-config'
import { cn } from '@client/lib/utils'
import { store } from '@client/store'

const CHAPTER_COUNTS = [1, 3, 6, 12, 25, 50]
const CHAPTER_LABELS = ['Essay', 'Short', 'Novella', 'Standard', 'Long', 'Epic']

function chapterCountToSliderPos(count: number): number {
  if (count <= CHAPTER_COUNTS[0]) return 0
  if (count >= CHAPTER_COUNTS[CHAPTER_COUNTS.length - 1]) return CHAPTER_COUNTS.length - 1
  for (let i = 0; i < CHAPTER_COUNTS.length - 1; i++) {
    if (count <= CHAPTER_COUNTS[i + 1]) {
      const frac = (count - CHAPTER_COUNTS[i]) / (CHAPTER_COUNTS[i + 1] - CHAPTER_COUNTS[i])
      return i + frac
    }
  }
  return 0
}

function getChapterLabel(count: number): string {
  const idx = CHAPTER_COUNTS.indexOf(count)
  if (idx >= 0) return CHAPTER_LABELS[idx]
  const nearest = CHAPTER_COUNTS.reduce((prev, curr) =>
    Math.abs(curr - count) < Math.abs(prev - count) ? curr : prev
  )
  return `~${CHAPTER_LABELS[CHAPTER_COUNTS.indexOf(nearest)]}`
}

import { COVER_STYLES, RANDOM_TOPICS } from '@client/features/creation/wizard-suggestions'

interface WizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (topic: string, details: string, chapterCount: number, coverPrompt?: string) => void
}

export function WizardModal({ open, onOpenChange, onCreate }: WizardModalProps) {
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')
  const [suggestingTopic, setSuggestingTopic] = useState(false)
  const [suggestingDetails, setSuggestingDetails] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [generateCover, setGenerateCover] = useState(false)
  const [coverDescription, setCoverDescription] = useState('')
  const dispatch = useAppDispatch()
  const defaultChapterCount = useAppSelector(selectDefaultChapterCount)
  const advancedMode = useAppSelector(selectAdvancedMode)
  const [chapterCount, setChapterCount] = useState(defaultChapterCount)
  const [editingCount, setEditingCount] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [countError, setCountError] = useState('')
  const [agenticCreating, setAgenticCreating] = useState(false)
  const { provider, model } = useAppSelector(selectFunctionModel('profile'))
  const hasApiKey = useAppSelector(selectHasApiKeyForFunction('profile'))

  // Reset chapter count when default changes or dialog opens
  useEffect(() => {
    if (open) {
      setChapterCount(defaultChapterCount)
      setEditingCount(false)
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
    onCreate(topic.trim(), details.trim(), chapterCount, coverPromptValue)
    setTopic('')
    setDetails('')
    setReasoning(null)
    setGenerateCover(false)
    setCoverDescription('')
  }

  const handleSuggestTopic = async (mode: 'deepen' | 'complementary') => {
    if (!hasApiKey || suggestingTopic) return
    setSuggestingTopic(true)
    setReasoning(null)

    try {
      const state = store.getState()
      const quizHistory = state.quizHistory?.quizzes ?? undefined

      const data = await suggestTopic({ model, provider, quizHistory, mode })
      setTopic(data.topic)
      if (data.reasoning) setReasoning(data.reasoning)
    } catch (err) {
      toast.error('Failed to suggest topic: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSuggestingTopic(false)
    }
  }

  const handleSurpriseMe = () => {
    const pick = RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)]
    setTopic(pick)
    setReasoning(null)
  }

  const handleAgenticCreate = async () => {
    if (!topic.trim()) {
      toast.error('Enter a topic first')
      return
    }
    setAgenticCreating(true)
    try {
      const data = await createSkeleton({
        title: topic.trim(),
        prompt: `${topic.trim()}${details.trim() ? `\n\n${details.trim()}` : ''}`,
        totalChapters: chapterCount,
      })

      const { command } = generateMcpConfig(getApiPort(), {
        bookId: data.bookId,
        topic: topic.trim(),
        details: details.trim() || undefined,
        chapterCount,
      })
      await navigator.clipboard.writeText(command)

      onOpenChange(false)
      setTopic('')
      setDetails('')
      setReasoning(null)
      toast.success(
        `Book "${data.title}" created. Command copied — paste in your terminal to start generation.`,
        { duration: 8000 },
      )
    } catch (err) {
      toast.error('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setAgenticCreating(false)
    }
  }

  const handleSuggestDetails = async () => {
    if (!hasApiKey || suggestingDetails || !topic.trim()) return
    setSuggestingDetails(true)

    try {
      const data = await suggestDetails({ topic: topic.trim(), model, provider })
      setDetails(data.details)
    } catch (err) {
      toast.error('Failed to suggest details: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSuggestingDetails(false)
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
            <div className="flex items-center justify-between">
              <label htmlFor="topic" className="text-sm font-medium text-content-primary">
                Topic
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={!hasApiKey || suggestingTopic}
                  className="flex items-center gap-1 text-xs text-[var(--color-ai)] hover:text-[var(--color-ai-hover)] disabled:opacity-50 cursor-default"
                >
                  {suggestingTopic ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  Suggest
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto">
                  <DropdownMenuItem onClick={() => handleSuggestTopic('deepen')}>
                    <TrendingUp className="size-4" />
                    Deepen existing skills
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSuggestTopic('complementary')}>
                    <Puzzle className="size-4" />
                    Learn complementary skills
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSurpriseMe}>
                    <Dices className="size-4" />
                    Surprise me
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <input
              id="topic"
              autoFocus
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g., Machine Learning, Strength Training, Public Speaking"
              className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="details" className="text-sm font-medium text-content-primary">
                Details
                <span className="text-xs font-normal text-content-muted ml-1">(optional)</span>
              </label>
              <button
                type="button"
                onClick={handleSuggestDetails}
                disabled={!hasApiKey || suggestingDetails || !topic.trim()}
                className="flex items-center gap-1 text-xs text-[var(--color-ai)] hover:text-[var(--color-ai-hover)] disabled:opacity-50"
              >
                {suggestingDetails ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                Suggest
              </button>
            </div>
            <textarea
              id="details"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Any specific areas to focus on, your experience level, or goals..."
              rows={20}
              className="min-h-[8rem] rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
          </div>

          {/* Chapter count slider */}
          <div className="grid gap-1.5">
            <div className={cn("relative flex items-center justify-between", countError && "mb-4")}>
              <span className="text-sm font-medium text-content-primary">Length</span>
              <span className="text-xs text-content-muted">
                {editingCount ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    value={editValue}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setEditValue(raw)
                      const n = parseInt(raw, 10)
                      if (!raw) {
                        setCountError('')
                      } else if (n > 50 || n < 1) {
                        setCountError('Must be between 1 and 50')
                      } else {
                        setCountError('')
                        setChapterCount(n)
                      }
                    }}
                    onBlur={() => {
                      const n = parseInt(editValue, 10)
                      if (!n || n < 1) setChapterCount(1)
                      else if (n > 50) setChapterCount(50)
                      setCountError('')
                      setEditingCount(false)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      } else if (e.key === 'Escape') {
                        setCountError('')
                        setEditingCount(false)
                      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const current = parseInt(editValue, 10) || chapterCount
                        const next = e.key === 'ArrowUp' ? Math.min(current + 1, 50) : Math.max(current - 1, 1)
                        setEditValue(String(next))
                        setCountError('')
                        setChapterCount(next)
                      } else if (['-', '.', ',', 'e', 'E', '+'].includes(e.key)) {
                        e.preventDefault()
                      }
                    }}
                    className={cn(
                      "w-[3.5rem] h-6 rounded-md border bg-surface-raised px-2 text-center text-xs text-content-primary outline-none tabular-nums",
                      countError ? "border-status-error ring-1 ring-status-error/30" : "border-border-focus ring-1 ring-border-focus/30"
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditValue(String(chapterCount)); setCountError(''); setEditingCount(true) }}
                    className="w-[3.5rem] h-6 rounded-md border border-border-default/60 bg-surface-raised/50 px-2 text-center tabular-nums cursor-text text-content-primary hover:border-border-focus/50 hover:bg-surface-raised transition-colors"
                  >
                    {chapterCount}
                  </button>
                )}
                {' '}{chapterCount === 1 ? 'chapter' : 'chapters'}
                <span className="ml-1.5 text-content-muted/60">{getChapterLabel(chapterCount)}</span>
              </span>
              {countError && (
                <span className="absolute right-0 top-full text-[10px] text-status-error mt-0.5">{countError}</span>
              )}
            </div>
            <TickSlider
              min={0}
              max={CHAPTER_COUNTS.length - 1}
              step={0.01}
              value={chapterCountToSliderPos(chapterCount)}
              onChange={v => setChapterCount(CHAPTER_COUNTS[Math.round(v)])}
              ticks={CHAPTER_COUNTS.map((count, i) => ({
                label: CHAPTER_LABELS[i],
                highlight: count === defaultChapterCount,
              }))}
            />
          </div>
        </div>

          {/* Advanced mode */}
          <div className="grid gap-2.5 mt-4">
            <label className="flex items-center justify-between cursor-pointer select-none">
              <span className="text-sm text-content-muted">Advanced Mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={advancedMode}
                onClick={() => dispatch(setAdvancedMode(!advancedMode))}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${advancedMode ? 'bg-[oklch(0.55_0.20_285)]' : 'bg-white/15'}`}
              >
                <span className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${advancedMode ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
              </button>
            </label>

            {advancedMode && (
              <div className="rounded-lg border border-border-default/50 bg-surface-muted/30 px-3 py-3 space-y-2.5">
                <p className="text-xs text-content-muted leading-relaxed">
                  Generate this book using Claude Code in your terminal.
                  Creates a skeleton and copies the launch command to your clipboard.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={agenticCreating}
                  onClick={handleAgenticCreate}
                  className="w-full gap-1.5"
                >
                  {agenticCreating
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <Terminal className="size-3.5" />}
                  {agenticCreating ? 'Creating...' : 'Generate in Terminal'}
                </Button>
              </div>
            )}
          </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter>
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
