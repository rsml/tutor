import { useState, useMemo, useRef, useEffect } from 'react'
import { X, BookOpen } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { Badge } from '@src/components/ui/badge'
import { Input } from '@src/components/ui/input'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'

interface ImportPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preview: {
    title: string
    subtitle?: string
    chapterCount: number
    hasCover: boolean
    coverBase64?: string
  } | null
  fileBase64: string
  filename: string
  allTags: string[]
  allSeriesNames: string[]
  onConfirm: (tags: string[], series: string | null, seriesOrder: number | null) => void
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  preview,
  filename,
  allTags,
  allSeriesNames,
  onConfirm,
}: ImportPreviewDialogProps) {
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagHighlightIndex, setTagHighlightIndex] = useState(-1)
  const [series, setSeries] = useState('')
  const [seriesOrder, setSeriesOrder] = useState('')
  const [seriesHighlightIndex, setSeriesHighlightIndex] = useState(-1)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTags([])
      setTagInput('')
      setTagHighlightIndex(-1)
      setSeries('')
      setSeriesOrder('')
      setSeriesHighlightIndex(-1)
    }
  }, [open])

  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return []
    return allTags
      .filter(t => t.includes(q) && !tags.includes(t))
      .slice(0, 8)
  }, [tagInput, allTags, tags])

  const seriesSuggestions = useMemo(() => {
    const q = series.trim().toLowerCase()
    if (!q) return []
    return allSeriesNames
      .filter(s => s.toLowerCase().includes(q) && s !== series)
      .slice(0, 5)
  }, [series, allSeriesNames])

  const normalizeTag = (tag: string): string => {
    return tag.trim().toLowerCase().replace(/\s+/g, '-')
  }

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag || tags.includes(tag) || tags.length >= 20) return
    setTags(prev => [...prev, tag])
    setTagInput('')
    setTagHighlightIndex(-1)
  }

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (tagHighlightIndex >= 0 && tagHighlightIndex < tagSuggestions.length) {
        addTag(tagSuggestions[tagHighlightIndex])
      } else if (tagInput.trim()) {
        addTag(tagInput)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setTagHighlightIndex(prev => Math.min(prev + 1, tagSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setTagHighlightIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const handleConfirm = () => {
    const trimmedSeries = series.trim() || null
    const parsedOrder = seriesOrder ? parseInt(seriesOrder, 10) : null
    onConfirm(tags, trimmedSeries, parsedOrder && !isNaN(parsedOrder) ? parsedOrder : null)
  }

  if (!preview) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle>Import EPUB</DialogTitle>
          <DialogDescription>Review the book details before importing.</DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

        <div className="min-w-0 space-y-4">
          {/* Book preview */}
          <div className="flex gap-4">
            {/* Cover thumbnail */}
            {preview.hasCover && preview.coverBase64 ? (
              <div className="shrink-0 w-20 aspect-[1/1.618] overflow-hidden rounded-lg shadow-md">
                <img
                  src={preview.coverBase64}
                  alt={preview.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="shrink-0 w-20 aspect-[1/1.618] overflow-hidden rounded-lg shadow-md bg-surface-muted flex items-center justify-center">
                <BookOpen className="size-8 text-content-faint" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-content-primary truncate">
                {preview.title}
              </h3>
              {preview.subtitle && (
                <p className="mt-0.5 text-sm text-content-muted line-clamp-2">
                  {preview.subtitle}
                </p>
              )}
              <p className="mt-1 text-xs text-content-muted">
                {preview.chapterCount} {preview.chapterCount === 1 ? 'chapter' : 'chapters'}
              </p>
              <p className="mt-0.5 text-xs text-content-faint truncate">
                {filename}
              </p>
            </div>
          </div>

          {/* Tags input */}
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Tags (optional)</label>
            <div className="relative">
              <Input
                ref={tagInputRef}
                value={tagInput}
                onChange={e => { setTagInput(e.target.value); setTagHighlightIndex(-1) }}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length >= 20 ? 'Max tags reached' : 'Type a tag and press Enter'}
                disabled={tags.length >= 20}
              />
              {tagSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border-default/50 bg-surface-base/95 py-1 shadow-lg backdrop-blur-md">
                  {tagSuggestions.map((tag, i) => (
                    <button
                      key={tag}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                        i === tagHighlightIndex
                          ? 'bg-surface-muted text-content-primary'
                          : 'text-content-primary hover:bg-surface-muted'
                      }`}
                      onMouseDown={e => { e.preventDefault(); addTag(tag) }}
                      onMouseEnter={() => setTagHighlightIndex(i)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    <span className="text-xs">{tag}</span>
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Series input */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="text-xs font-medium text-content-muted mb-1 block">Series (optional)</label>
              <div className="relative">
                <Input
                  value={series}
                  onChange={e => { setSeries(e.target.value); setSeriesHighlightIndex(-1) }}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSeriesHighlightIndex(prev => Math.min(prev + 1, seriesSuggestions.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSeriesHighlightIndex(prev => Math.max(prev - 1, -1))
                    } else if (e.key === 'Enter' && seriesHighlightIndex >= 0) {
                      e.preventDefault()
                      setSeries(seriesSuggestions[seriesHighlightIndex])
                      setSeriesHighlightIndex(-1)
                    }
                  }}
                  placeholder="Series name"
                />
                {seriesSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border-default/50 bg-surface-base/95 py-1 shadow-lg backdrop-blur-md">
                    {seriesSuggestions.map((s, i) => (
                      <button
                        key={s}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                          i === seriesHighlightIndex
                            ? 'bg-surface-muted text-content-primary'
                            : 'text-content-primary hover:bg-surface-muted'
                        }`}
                        onMouseDown={e => { e.preventDefault(); setSeries(s); setSeriesHighlightIndex(-1) }}
                        onMouseEnter={() => setSeriesHighlightIndex(i)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-content-muted mb-1 block">Order</label>
              <Input
                type="number"
                min={1}
                value={seriesOrder}
                onChange={e => setSeriesOrder(e.target.value)}
                placeholder="#"
                className="w-16"
                disabled={!series.trim()}
              />
            </div>
          </div>
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm}>Import</Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
