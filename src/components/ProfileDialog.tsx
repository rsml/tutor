import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
} from '@src/components/ui/dialog'
import { apiUrl } from '@src/lib/api-base'
import { type Skill, type Preferences, BOOL_PREF_LABELS, BOOL_KEYS, SLIDER_PREFS, DEFAULT_PREFS } from '@src/lib/profile-constants'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartInterview: () => void
  onOpenSkills: () => void
}

export function ProfileDialog({ open, onOpenChange, onStartInterview, onOpenSkills }: ProfileDialogProps) {
  const [aboutMe, setAboutMe] = useState('')
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const [skills, setSkills] = useState<Skill[]>([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!open) {
      setShowConfirm(false)
      return
    }
    // Always re-fetch when opening
    setLoaded(false)
    fetch(apiUrl('/api/profile'))
      .then(res => res.json())
      .then(data => {
        if (data.aboutMe) setAboutMe(data.aboutMe)
        if (data.preferences) setPreferences(prev => ({ ...prev, ...data.preferences }))
        if (data.skills) setSkills(data.skills)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(apiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aboutMe: aboutMe.trim(), preferences, skills }),
      })
      onOpenChange(false)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const togglePref = (key: string) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key as keyof Preferences] }))
  }

  const setSlider = (key: string, value: number) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
  }

  const handleInterviewClick = () => {
    if (aboutMe.trim()) {
      setShowConfirm(true)
    } else {
      onStartInterview()
    }
  }

  const handleConfirmInterview = () => {
    setShowConfirm(false)
    onStartInterview()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-lg">
        <ScrollableDialogHeader>
          <DialogTitle>Learning Profile</DialogTitle>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

        <div className="grid gap-4 px-4 py-4">
          {/* Prior Knowledge */}
          <div className="grid gap-2">
            <span className="text-sm font-medium text-content-primary">Prior Knowledge</span>
            <button
              type="button"
              onClick={onOpenSkills}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-default/50 px-3 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-raised hover:text-content-primary"
            >
              <span>{skills.length > 0 ? `${skills.length} skill${skills.length !== 1 ? 's' : ''}` : 'No skills added'}</span>
              <ChevronRight className="size-4 text-content-muted" />
            </button>
          </div>

          {/* About Me */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="about-me" className="text-sm font-medium text-content-primary">
                About Me
              </label>
              <Button variant="ghost" size="sm" onClick={handleInterviewClick} className="gap-1.5 text-[var(--color-ai)] hover:text-[var(--color-ai-hover)] hover:bg-[var(--color-ai)]/10">
                <Sparkles className="size-3.5" />
                Interview Me
              </Button>
            </div>

            {showConfirm && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-xs text-content-secondary">
                <span>This will replace your About Me, preferences, and style settings. Prior knowledge is kept.</span>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowConfirm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-6 text-xs px-2" onClick={handleConfirmInterview}>
                    Continue
                  </Button>
                </div>
              </div>
            )}

            <textarea
              id="about-me"
              value={aboutMe}
              onChange={e => setAboutMe(e.target.value)}
              rows={4}
              className="rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              placeholder="Your background, experience level, what you're trying to learn..."
            />
          </div>

          {/* Boolean Toggles */}
          <div className="grid gap-2">
            <span className="text-sm font-medium text-content-primary">Preferences</span>
            {BOOL_KEYS.map(key => (
              <label key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-content-secondary">{BOOL_PREF_LABELS[key]}</span>
                <button
                  type="button"
                  onClick={() => togglePref(key)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    preferences[key as keyof Preferences] ? 'bg-[oklch(0.55_0.20_285)]' : 'bg-content-muted/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
                      preferences[key as keyof Preferences] ? 'translate-x-[18px]' : 'translate-x-0.5'
                    } translate-y-0.5`}
                  />
                </button>
              </label>
            ))}
          </div>

          {/* Slider Preferences */}
          <div className="grid gap-3">
            <span className="text-sm font-medium text-content-primary">Style</span>
            {SLIDER_PREFS.map(({ key, label, left, right }) => (
              <div key={key} className="grid gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-secondary">{label}</span>
                  <span className="text-xs tabular-nums text-content-muted">{preferences[key] as number}/5</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-content-muted w-20 text-right shrink-0">{left}</span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={preferences[key] as number}
                    onChange={e => setSlider(key, parseInt(e.target.value))}
                    className="flex-1 cursor-pointer"
                    style={{ '--range-fill': `${(((preferences[key] as number) - 1) / 4) * 100}%` } as React.CSSProperties}
                  />
                  <span className="text-[10px] text-content-muted w-20 shrink-0">{right}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !loaded}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
