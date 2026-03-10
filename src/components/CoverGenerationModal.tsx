import { useState, useRef } from 'react'
import { ImagePlus, Upload, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
import { useAppSelector, selectFunctionModel } from '@src/store'
import { apiUrl } from '@src/lib/api-base'

interface CoverGenerationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: string
  bookTitle: string
  bookTopic: string
  onCoverUploaded: () => void
}

export function CoverGenerationModal({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  bookTopic,
  onCoverUploaded,
}: CoverGenerationModalProps) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { provider, model } = useAppSelector(selectFunctionModel('image'))

  const handleSuggest = () => {
    setPrompt(`Book cover for "${bookTitle}": ${bookTopic}. Clean, modern design with abstract imagery. No text on the cover.`)
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
      toast.error(err instanceof Error ? err.message : 'Cover generation failed')
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
      if (!res.ok) throw new Error('Upload failed')
      toast.success('Cover uploaded')
      onCoverUploaded()
      onOpenChange(false)
    } catch {
      toast.error('Failed to upload cover')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="size-5" />
            Book Cover
          </DialogTitle>
          <DialogDescription>Generate an AI cover or upload your own image.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-content-primary">
              Image description
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the cover you want..."
              rows={3}
              className="resize-y rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSuggest}
              className="self-start gap-1 text-xs text-[var(--color-ai)] hover:text-[var(--color-ai-hover)]"
            >
              <Sparkles className="size-3" />
              Auto-suggest
            </Button>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
          >
            {generating ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <ImagePlus className="size-4" data-icon="inline-start" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
