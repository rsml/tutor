import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Circle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import { useAppSelector } from '@src/store'
import { apiUrl } from '@src/lib/api-base'

interface BookOverviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: { id: string; title: string; totalChapters: number }
}

interface TocChapter {
  title: string
  description: string
}

export function BookOverviewModal({ open, onOpenChange, book }: BookOverviewModalProps) {
  const [toc, setToc] = useState<TocChapter[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const furthest = useAppSelector(s => s.readingProgress.furthest[book.id] ?? -1)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch(apiUrl(`/api/books/${book.id}/toc`)).then(r => r.json()),
      fetch(apiUrl(`/api/books/${book.id}`)).then(r => r.json()),
    ])
      .then(([tocData, metaData]) => {
        setToc(tocData.chapters || [])
        setPrompt(metaData.prompt || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, book.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{book.title}</DialogTitle>
          {prompt && <DialogDescription>{prompt}</DialogDescription>}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-content-muted">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {toc.map((ch, i) => {
              const read = i <= furthest
              return (
                <div key={i} className="flex items-start gap-3">
                  {read ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-green-500" />
                  ) : (
                    <Circle className="size-4 shrink-0 mt-0.5 text-content-muted/40" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${read ? 'text-content-primary' : 'text-content-muted'}`}>
                      {i + 1}. {ch.title}
                    </p>
                    <p className="text-xs text-content-muted/70">{ch.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
