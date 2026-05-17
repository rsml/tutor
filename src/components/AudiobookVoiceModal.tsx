import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
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
import { apiUrl } from '@src/lib/api-base'

interface VoiceInfo {
  id: string
  name: string
  language: 'American English' | 'British English'
  gender: 'Male' | 'Female'
  grade: string
}

interface AudiobookVoiceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: string
  bookTitle: string
  // When true, voice + speed get persisted to learning-profile on submit.
  rememberAsDefaultByDefault?: boolean
  // First-time after engine install vs subsequent invocation.
  mode: 'firstTime' | 'normal' | 'regenerate'
}

const DEFAULT_VOICE = 'am_michael'
const MIN_SPEED = 0.7
const MAX_SPEED = 1.3
const SPEED_STEP = 0.05

interface ModeCopy {
  title: string
  description: string
}

function getModeCopy(mode: AudiobookVoiceModalProps['mode'], bookTitle: string): ModeCopy {
  if (mode === 'firstTime') {
    return {
      title: 'Kokoro narrator is ready',
      description:
        "It's installed on your computer and free to use. Pick a voice — we'll remember it for next time.",
    }
  }
  if (mode === 'regenerate') {
    return {
      title: 'Generate new audiobook',
      description: `This replaces the existing audiobook for ${bookTitle} with a fresh narration.`,
    }
  }
  return {
    title: 'Generate audiobook',
    description:
      "We'll narrate each chapter and stitch them into a single audiobook file. This takes a few minutes depending on book length and your computer's speed. You can keep using Tutor while it runs.",
  }
}

// Order voices by gender (Male first) within each language group.
function sortVoicesByGender(voices: VoiceInfo[]): VoiceInfo[] {
  return [...voices].sort((a, b) => {
    if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function AudiobookVoiceModal({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  rememberAsDefaultByDefault = true,
  mode,
}: AudiobookVoiceModalProps) {
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE)
  const [speed, setSpeed] = useState<number>(1.0)
  const [rememberAsDefault, setRememberAsDefault] = useState<boolean>(rememberAsDefaultByDefault)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Load voices when modal opens; reset state on close.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/audiobook/voices'))
        if (!res.ok) throw new Error(`Failed: ${res.status}`)
        const data = (await res.json()) as { voices: VoiceInfo[] }
        if (cancelled) return
        setVoices(data.voices)
        // Keep DEFAULT_VOICE if available, otherwise pick first.
        if (!data.voices.some(v => v.id === DEFAULT_VOICE) && data.voices[0]) {
          setSelectedVoice(data.voices[0].id)
        }
      } catch (err) {
        if (cancelled) return
        toast.error('Failed to load voices: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // Stop any preview audio when the modal closes or unmounts.
  useEffect(() => {
    if (open) return
    audioRef.current?.pause()
    audioRef.current = null
    setPreviewing(false)
  }, [open])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const grouped = useMemo(() => {
    const american = voices.filter(v => v.language === 'American English')
    const british = voices.filter(v => v.language === 'British English')
    return {
      american: sortVoicesByGender(american),
      british: sortVoicesByGender(british),
    }
  }, [voices])

  const handlePreview = async () => {
    if (previewing || !selectedVoice) return
    setPreviewing(true)
    audioRef.current?.pause()
    try {
      const audio = new Audio(apiUrl(`/api/audiobook/voices/${selectedVoice}/preview`))
      audioRef.current = audio
      audio.addEventListener('ended', () => setPreviewing(false), { once: true })
      audio.addEventListener('error', () => {
        setPreviewing(false)
        toast.error('Failed to play voice preview')
      }, { once: true })
      await audio.play()
    } catch (err) {
      setPreviewing(false)
      toast.error('Failed to preview: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl(`/api/books/${bookId}/audiobook`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: selectedVoice,
          speed,
          rememberAsDefault,
          confirmReplace: mode === 'regenerate',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Request failed: ${res.status}`)
      }
      toast.success('Audiobook generation started — check background tasks')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to start: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  const copy = getModeCopy(mode, bookTitle)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="audiobook-voice" className="text-sm font-medium text-content-primary">
                Voice
              </label>
              <select
                id="audiobook-voice"
                value={selectedVoice}
                onChange={e => setSelectedVoice(e.target.value)}
                className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              >
                {grouped.american.length > 0 && (
                  <optgroup label="American English">
                    {grouped.american.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gender}, {v.grade})
                      </option>
                    ))}
                  </optgroup>
                )}
                {grouped.british.length > 0 && (
                  <optgroup label="British English">
                    {grouped.british.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gender}, {v.grade})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreview}
                disabled={previewing || voices.length === 0}
                className="self-start gap-1 text-xs"
              >
                {previewing
                  ? <Loader2 className="size-3 animate-spin" />
                  : <Volume2 className="size-3" />}
                {previewing ? 'Loading...' : 'Preview voice'}
              </Button>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="audiobook-speed" className="text-sm font-medium text-content-primary">
                  Speed
                </label>
                <span className="text-xs text-content-muted tabular-nums">{speed.toFixed(2)}×</span>
              </div>
              <input
                id="audiobook-speed"
                type="range"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={SPEED_STEP}
                value={speed}
                onChange={e => setSpeed(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-[oklch(0.55_0.20_285)]"
              />
              <div className="flex justify-between text-[10px] text-content-muted/60 tabular-nums">
                <span>0.7×</span>
                <span>1.0×</span>
                <span>1.3×</span>
              </div>
            </div>

            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <input
                  id="audiobook-remember"
                  type="checkbox"
                  checked={rememberAsDefault}
                  onChange={e => setRememberAsDefault(e.target.checked)}
                  className="accent-[oklch(0.55_0.20_285)]"
                />
                <label htmlFor="audiobook-remember" className="text-sm text-content-primary cursor-pointer">
                  Remember as my default voice
                </label>
              </div>
              <p className="text-xs text-content-muted pl-6">
                Use this voice automatically for future audiobooks.
              </p>
            </div>
          </div>
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || voices.length === 0}>
            {submitting && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Start generation
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
