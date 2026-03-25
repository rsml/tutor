import { useState, useRef } from 'react'
import { ImagePlus, Upload, Sparkles, Loader2, Trash2 } from 'lucide-react'
import { toast } from '@src/lib/toast'
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
import { useAppSelector, selectFunctionModel } from '@src/store'
import { apiUrl } from '@src/lib/api-base'

interface CoverGenerationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: string
  bookTitle: string
  bookTopic: string
  hasCover?: boolean
  showTitleOnCover?: boolean
  onCoverChanged: () => void
}

export function CoverGenerationModal({
  open,
  onOpenChange,
  bookId,
  bookTitle: _bookTitle,
  bookTopic: _bookTopic,
  hasCover,
  showTitleOnCover: initialShowTitle,
  onCoverChanged,
}: CoverGenerationModalProps) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showTitle, setShowTitle] = useState(initialShowTitle ?? true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { provider, model } = useAppSelector(selectFunctionModel('image'))
  const textModel = useAppSelector(selectFunctionModel('generation'))

  const handleSuggest = async () => {
    if (suggesting) return
    setSuggesting(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/cover/suggest-prompt`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: textModel.provider, model: textModel.model }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Suggestion failed' }))
        throw new Error(err.error)
      }
      const data = await res.json()
      setPrompt(data.prompt)
    } catch (err) {
      toast.error('Failed to suggest cover prompt: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSuggesting(false)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/cover/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), provider, model }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }))
        throw new Error(err.error)
      }
      toast.success('Cover generation started — check background tasks')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to generate cover: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setGenerating(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (uploading) return
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )
      const mediaType = file.type === 'image/jpeg' ? 'image/jpeg'
        : file.type === 'image/webp' ? 'image/webp'
        : 'image/png'

      const res = await fetch(apiUrl(`/api/books/${bookId}/cover/upload`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || 'Upload failed')
      }
      toast.success('Cover uploaded')
      onCoverChanged()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to upload cover: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/cover`), { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || 'Delete failed')
      }
      toast.success('Cover deleted')
      onCoverChanged()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to delete cover: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleShowTitle = async (checked: boolean) => {
    setShowTitle(checked)
    try {
      await fetch(apiUrl(`/api/books/${bookId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showTitleOnCover: checked }),
      })
      onCoverChanged()
    } catch {
      toast.error('Failed to update setting')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="size-5" />
            Book Cover
          </DialogTitle>
          <DialogDescription>Generate an AI cover or upload your own image.</DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-content-primary">
              Image description
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the cover you want..."
              rows={8}
              className="rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSuggest}
              disabled={suggesting}
              className="self-start gap-1 text-xs text-[var(--color-ai)] hover:text-[var(--color-ai-hover)]"
            >
              {suggesting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              {suggesting ? 'Suggesting...' : 'Auto-suggest'}
            </Button>
          </div>

          {/* Show title on cover toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-title-on-cover"
              checked={showTitle}
              onChange={e => handleToggleShowTitle(e.target.checked)}
              className="accent-[oklch(0.55_0.20_285)]"
            />
            <label htmlFor="show-title-on-cover" className="text-sm text-content-primary cursor-pointer">
              Show title on cover
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border-default/50" />
            <span className="text-xs text-content-muted">or</span>
            <div className="h-px flex-1 bg-border-default/50" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload Image
          </Button>
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter className="justify-between">
          {hasCover ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete Cover
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={!prompt.trim() || generating}
            >
              {generating ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <ImagePlus className="size-4" data-icon="inline-start" />}
              Generate
            </Button>
          </div>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
