import { useState, useMemo, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
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

interface EditTagsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: string
  currentTags: string[]
  allTags: string[]
  onSave: (bookId: string, tags: string[]) => void
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-')
}

export function EditTagsDialog({ open, onOpenChange, bookId, currentTags, allTags, onSave }: EditTagsDialogProps) {
  const [tags, setTags] = useState<string[]>(currentTags)
  const [input, setInput] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTags(currentTags)
      setInput('')
      setHighlightIndex(-1)
    }
  }, [open, currentTags])

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q) return []
    return allTags
      .filter(t => t.includes(q) && !tags.includes(t))
      .slice(0, 8)
  }, [input, allTags, tags])

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag || tags.includes(tag) || tags.length >= 20) return
    setTags(prev => [...prev, tag])
    setInput('')
    setHighlightIndex(-1)
  }

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        addTag(suggestions[highlightIndex])
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Escape' && suggestions.length > 0) {
      setInput('')
      setHighlightIndex(-1)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const handleSave = () => {
    onSave(bookId, tags)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle>Edit Tags</DialogTitle>
          <DialogDescription>Add or remove tags for this book. Max 20 tags.</DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody className="px-4 py-4">

        <div className="space-y-3">
          {/* Input with autocomplete */}
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); setHighlightIndex(-1) }}
              onKeyDown={handleKeyDown}
              placeholder={tags.length >= 20 ? 'Max tags reached' : 'Type a tag and press Enter'}
              disabled={tags.length >= 20}
              autoFocus
            />
            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border-default/50 bg-surface-base/95 py-1 shadow-lg backdrop-blur-md">
                {suggestions.map((tag, i) => (
                  <button
                    key={tag}
                    className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                      i === highlightIndex
                        ? 'bg-surface-muted text-content-primary'
                        : 'text-content-primary hover:bg-surface-muted'
                    }`}
                    onMouseDown={e => { e.preventDefault(); addTag(tag) }}
                    onMouseEnter={() => setHighlightIndex(i)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current tags */}
          <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
            {tags.length === 0 && (
              <span className="text-xs text-content-muted">No tags yet</span>
            )}
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

          {tags.length > 0 && (
            <p className="text-xs text-content-muted">{tags.length}/20 tags</p>
          )}
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
