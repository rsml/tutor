import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, Info, Loader2, Volume2 } from 'lucide-react'
import { toast } from '@client/lib/toast'
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
import { getProfile, saveProfile, voicePreviewUrl, type Skill } from '@client/api'
import { useAudiobookEngine } from '@client/features/audiobook/hooks/useAudiobookEngine'
import { type Preferences, DEFAULT_PREFS } from '@client/lib/profile-constants'
import type { AudiobookPreferences } from '@shared/domain'
import type { VoiceInfo } from '@shared/responses'

interface AudiobookSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_VOICE = 'am_michael'
const DEFAULT_SPEED = 1.0
const MIN_SPEED = 0.7
const MAX_SPEED = 1.3
const SPEED_STEP = 0.05
const MIN_WORKERS = 1
const MAX_WORKERS = 16

function sortVoicesByGender(voices: VoiceInfo[]): VoiceInfo[] {
  return [...voices].sort((a, b) => {
    if (a.gender !== b.gender) return a.gender === 'Male' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function AudiobookSettingsDialog({ open, onOpenChange }: AudiobookSettingsDialogProps) {
  const [loaded, setLoaded] = useState(false)
  const [aboutMe, setAboutMe] = useState('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const { status, voices, installing, loadStatus, loadVoices, install } = useAudiobookEngine()
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE)
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED)
  const [workerOverride, setWorkerOverride] = useState<string>('')
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!open) {
      setLoaded(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [profile, , voicesData] = await Promise.all([
          getProfile(),
          loadStatus(),
          loadVoices(),
        ])

        if (cancelled) return

        setAboutMe(profile.aboutMe ?? '')
        setSkills(profile.skills ?? [])
        const prefs = { ...DEFAULT_PREFS, ...profile.preferences }
        setPreferences(prefs)

        const audiobook = profile.preferences?.audiobook
        const desiredVoice = audiobook?.defaultVoiceId ?? DEFAULT_VOICE
        const voiceExists = voicesData.some(v => v.id === desiredVoice)
        setSelectedVoice(voiceExists ? desiredVoice : voicesData[0]?.id ?? DEFAULT_VOICE)
        setSpeed(audiobook?.defaultSpeed ?? DEFAULT_SPEED)
        setWorkerOverride(audiobook?.workerOverride != null ? String(audiobook.workerOverride) : '')
        setLoaded(true)
      } catch (err) {
        if (cancelled) return
        toast.error(
          'Failed to load audiobook settings: ' +
            (err instanceof Error ? err.message : 'Unknown error'),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, loadStatus, loadVoices])

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
    if (!status?.installed) {
      toast.error('Install the narrator first to preview voices')
      return
    }
    setPreviewing(true)
    audioRef.current?.pause()
    try {
      const audio = new Audio(voicePreviewUrl(selectedVoice))
      audioRef.current = audio
      audio.addEventListener('ended', () => setPreviewing(false), { once: true })
      audio.addEventListener(
        'error',
        () => {
          setPreviewing(false)
          toast.error('Failed to play voice preview')
        },
        { once: true },
      )
      await audio.play()
    } catch (err) {
      setPreviewing(false)
      toast.error('Failed to preview: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleInstall = async (isReinstall: boolean) => {
    if (installing) return
    try {
      // v1 limitation: there is no separate "force/redownload" endpoint. The
      // install task only fetches components reported as missing, so a true
      // wipe-and-redownload would need a new server endpoint.
      await install()
      toast.success(
        isReinstall
          ? "Checking narrator components — we'll redownload anything missing."
          : "Setting up narration — we'll let you know when it's ready.",
      )
    } catch (err) {
      toast.error(
        'Failed to start install: ' + (err instanceof Error ? err.message : 'Unknown error'),
      )
    }
  }

  const validate = (): AudiobookPreferences | null => {
    if (!voices.some(v => v.id === selectedVoice)) {
      toast.error('Pick a valid voice')
      return null
    }
    if (speed < MIN_SPEED || speed > MAX_SPEED) {
      toast.error(`Speed must be between ${MIN_SPEED} and ${MAX_SPEED}`)
      return null
    }
    let workers: number | undefined
    const trimmed = workerOverride.trim()
    if (trimmed) {
      const parsed = Number(trimmed)
      if (!Number.isInteger(parsed) || parsed < MIN_WORKERS || parsed > MAX_WORKERS) {
        toast.error(`Worker count must be an integer between ${MIN_WORKERS} and ${MAX_WORKERS}`)
        return null
      }
      workers = parsed
    }
    return {
      defaultVoiceId: selectedVoice,
      defaultSpeed: Number(speed.toFixed(2)),
      ...(workers != null ? { workerOverride: workers } : {}),
    }
  }

  const handleSave = async () => {
    if (saving) return
    const audiobook = validate()
    if (!audiobook) return
    setSaving(true)
    try {
      const nextPreferences = { ...preferences, audiobook }
      await saveProfile({ aboutMe, preferences: nextPreferences, skills })
      toast.success('Audiobook settings saved.')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-lg">
        <ScrollableDialogHeader>
          <DialogTitle>Audiobook narration</DialogTitle>
          <DialogDescription>
            Defaults for offline narration. Per-book settings override these.
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          {!loaded ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-content-muted">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="grid gap-5">
              {status?.installed ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-status-ok/20 bg-status-ok/5 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 text-status-ok mt-0.5 shrink-0" />
                    <p className="text-sm text-content-secondary">
                      Narrator installed — ready to generate audiobooks.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInstall(true)}
                    disabled={installing}
                    className="shrink-0"
                  >
                    {installing && <Loader2 className="size-3 animate-spin" data-icon="inline-start" />}
                    Re-download model
                  </Button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-status-warn/30 bg-status-warn/10 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Info className="size-4 text-status-warn mt-0.5 shrink-0" />
                    <p className="text-sm text-content-secondary">
                      Narrator not installed yet — it'll auto-download the next time you generate an audiobook.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInstall(false)}
                    disabled={installing}
                    className="shrink-0"
                  >
                    {installing
                      ? <Loader2 className="size-3 animate-spin" data-icon="inline-start" />
                      : <Download className="size-3" data-icon="inline-start" />}
                    Download now
                  </Button>
                </div>
              )}

              <div className="grid gap-1.5">
                <label htmlFor="audiobook-settings-voice" className="text-sm font-medium text-content-primary">
                  Default voice
                </label>
                <select
                  id="audiobook-settings-voice"
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
                  disabled={previewing || voices.length === 0 || !status?.installed}
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
                  <label htmlFor="audiobook-settings-speed" className="text-sm font-medium text-content-primary">
                    Default speed
                  </label>
                  <span className="text-xs text-content-muted tabular-nums">{speed.toFixed(2)}×</span>
                </div>
                <input
                  id="audiobook-settings-speed"
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

              <div className="grid gap-1.5">
                <label htmlFor="audiobook-settings-workers" className="text-sm font-medium text-content-primary">
                  Worker count
                </label>
                <input
                  id="audiobook-settings-workers"
                  type="number"
                  min={MIN_WORKERS}
                  max={MAX_WORKERS}
                  step={1}
                  value={workerOverride}
                  onChange={e => setWorkerOverride(e.target.value)}
                  placeholder="Auto"
                  className="h-9 w-24 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
                />
                <p className="text-xs text-content-muted">
                  Auto-detects based on RAM (recommended). Override only if you know what you're doing.
                </p>
              </div>
            </div>
          )}
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!loaded || saving}>
            {saving && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Save
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
