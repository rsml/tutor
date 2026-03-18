import { useState, useMemo, useEffect } from 'react'
import { Button } from '@src/components/ui/button'
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

interface SetSeriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: string
  currentSeries?: string
  currentSeriesOrder?: number
  allSeriesNames: string[]
  onSave: (bookId: string, series: string | null, seriesOrder: number | null) => void
}

export function SetSeriesDialog({
  open,
  onOpenChange,
  bookId,
  currentSeries,
  currentSeriesOrder,
  allSeriesNames,
  onSave,
}: SetSeriesDialogProps) {
  const [seriesName, setSeriesName] = useState(currentSeries ?? '')
  const [orderStr, setOrderStr] = useState(currentSeriesOrder?.toString() ?? '1')
  const [highlightIndex, setHighlightIndex] = useState(-1)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSeriesName(currentSeries ?? '')
      setOrderStr(currentSeriesOrder?.toString() ?? '1')
      setHighlightIndex(-1)
    }
  }, [open, currentSeries, currentSeriesOrder])

  const suggestions = useMemo(() => {
    const q = seriesName.trim().toLowerCase()
    if (!q) return []
    return allSeriesNames
      .filter(s => s.toLowerCase().includes(q) && s !== seriesName)
      .slice(0, 8)
  }, [seriesName, allSeriesNames])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < suggestions.length) {
      e.preventDefault()
      setSeriesName(suggestions[highlightIndex])
      setHighlightIndex(-1)
    }
  }

  const handleSave = () => {
    const trimmed = seriesName.trim()
    if (!trimmed) {
      // Remove series
      onSave(bookId, null, null)
    } else {
      const order = parseInt(orderStr, 10)
      onSave(bookId, trimmed, isNaN(order) || order < 1 ? 1 : order)
    }
    onOpenChange(false)
  }

  const handleRemove = () => {
    onSave(bookId, null, null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-sm">
        <ScrollableDialogHeader>
          <DialogTitle>Set Series</DialogTitle>
          <DialogDescription>Assign this book to a series, or clear to remove.</DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

        <div className="space-y-3">
          {/* Series name input */}
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Series Name</label>
            <div className="relative">
              <Input
                value={seriesName}
                onChange={e => { setSeriesName(e.target.value); setHighlightIndex(-1) }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Machine Learning Fundamentals"
                autoFocus
              />
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border-default/50 bg-surface-base/95 py-1 shadow-lg backdrop-blur-md">
                  {suggestions.map((name, i) => (
                    <button
                      key={name}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                        i === highlightIndex
                          ? 'bg-surface-muted text-content-primary'
                          : 'text-content-primary hover:bg-surface-muted'
                      }`}
                      onMouseDown={e => { e.preventDefault(); setSeriesName(name); setHighlightIndex(-1) }}
                      onMouseEnter={() => setHighlightIndex(i)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Order number input */}
          <div>
            <label className="text-xs font-medium text-content-muted mb-1 block">Order in Series</label>
            <Input
              type="number"
              min={1}
              value={orderStr}
              onChange={e => setOrderStr(e.target.value)}
              placeholder="1"
              className="w-24"
            />
          </div>
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          {currentSeries && (
            <Button variant="outline" onClick={handleRemove} className="mr-auto text-status-error hover:text-status-error">
              Remove from Series
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
