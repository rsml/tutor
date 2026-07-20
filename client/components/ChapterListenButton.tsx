import { useCallback, useEffect, useRef, useState } from 'react'
import { Headphones, X } from 'lucide-react'
import { apiUrl } from '@client/lib/api-base'
import { cn } from '@client/lib/utils'

interface Props {
  bookId: string
  chapterNum: number
  voiceName?: string
  /** Audiobook generatedAt — drives cache-busting so re-narrating a
   *  chapter doesn't serve the browser's stale MP3 from the prior run. */
  generatedAt?: string
  /** Chapter offset within the unified audiobook (seconds). The button
   *  seeks the audio element to this position on load. */
  startSec?: number
  /** Chapter length (seconds). The button auto-pauses when playback
   *  passes the chapter boundary so listening to chapter 2 doesn't
   *  silently bleed into chapter 3. */
  durationSec?: number
  available: boolean
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ChapterListenButton({
  bookId,
  chapterNum,
  voiceName,
  generatedAt,
  startSec = 0,
  durationSec,
  available,
}: Props) {
  const [open, setOpen] = useState(false)
  const [chapterTime, setChapterTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startSecRef = useRef(startSec)
  startSecRef.current = startSec
  const endSec = durationSec != null ? startSec + durationSec : undefined
  const endSecRef = useRef(endSec)
  endSecRef.current = endSec

  // Auto-pause and tear down on chapter change. Capture the ref into a
  // local so the cleanup function still sees the audio element that was
  // current when this effect last ran.
  useEffect(() => {
    const a = audioRef.current
    return () => {
      if (a) {
        a.pause()
        a.currentTime = 0
      }
    }
  }, [chapterNum])

  // Seek to the chapter offset once metadata is available. Without this,
  // playback starts at the file's 0:00 (i.e., chapter 1) regardless of
  // which chapter the user opened.
  const handleLoadedMetadata = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (startSecRef.current > 0) {
      a.currentTime = startSecRef.current
    }
  }, [])

  // While playing, expose chapter-local time and pause at the chapter
  // boundary so chapters don't bleed into one another.
  const handleTimeUpdate = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    const local = a.currentTime - startSecRef.current
    setChapterTime(local < 0 ? 0 : local)
    if (endSecRef.current != null && a.currentTime >= endSecRef.current) {
      a.pause()
      a.currentTime = endSecRef.current
    }
  }, [])

  if (!available) return null

  const src = apiUrl(`/api/books/${bookId}/audiobook/file${generatedAt ? `?v=${encodeURIComponent(generatedAt)}` : ''}`)
  const totalLabel = durationSec != null ? formatTime(durationSec) : '—'

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
              <p className="text-xs text-content-muted">
                {voiceName ? `Narrated by ${voiceName} · ` : ''}{formatTime(chapterTime)} / {totalLabel}
              </p>
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
            src={src}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>
      )}
    </>
  )
}
