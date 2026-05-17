import { useEffect, useRef, useState } from 'react'
import { Headphones, X } from 'lucide-react'
import { apiUrl } from '@src/lib/api-base'
import { cn } from '@src/lib/utils'

interface Props {
  bookId: string
  chapterNum: number
  voiceName?: string
  available: boolean
}

export function ChapterListenButton({ bookId, chapterNum, voiceName, available }: Props) {
  const [open, setOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Auto-pause if the chapter changes under us. Capture the ref into a local
  // so the cleanup function still sees the audio element that was current
  // when this effect last ran, not whatever the ref points to later.
  useEffect(() => {
    const a = audioRef.current
    return () => {
      if (a) {
        a.pause()
        a.currentTime = 0
      }
    }
  }, [chapterNum])

  if (!available) return null

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'absolute right-6 top-3 z-20 inline-flex items-center gap-1.5 p-2 transition-all',
          open ? 'text-content-primary opacity-100' : 'text-content-muted opacity-50 hover:opacity-100',
        )}
        title="Listen to this chapter"
        aria-label="Listen to this chapter"
      >
        <Headphones className="size-5" />
      </button>

      {open && (
        <div className="absolute right-4 top-14 z-30 w-80 rounded-lg border border-border-default/50 bg-surface-base/95 p-3 shadow-lg backdrop-blur-md">
          <div className="mb-2 flex items-start justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-content-primary">Chapter {chapterNum}</p>
              {voiceName && (
                <p className="text-xs text-content-muted">Narrated by {voiceName}</p>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 shrink-0 p-1 text-content-muted transition-colors hover:text-content-primary"
              aria-label="Close player"
            >
              <X className="size-4" />
            </button>
          </div>
          <audio
            ref={audioRef}
            controls
            preload="auto"
            crossOrigin="anonymous"
            className="w-full"
            src={apiUrl(`/api/books/${bookId}/chapters/${chapterNum}/audio`)}
          />
        </div>
      )}
    </>
  )
}
