import { useEffect, useState } from 'react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
import { apiUrl } from '@src/lib/api-base'

interface Preferences {
  explainComplexTermsSimply: boolean
  assumePriorKnowledge: boolean
  codeExamples: boolean
  realWorldAnalogies: boolean
}

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PREF_LABELS: Record<keyof Preferences, string> = {
  explainComplexTermsSimply: 'Explain complex terms simply',
  assumePriorKnowledge: 'Assume prior knowledge',
  codeExamples: 'Include code examples',
  realWorldAnalogies: 'Use real-world analogies',
}

const DEFAULT_ABOUT = `CTO, expert in frontend/UX/mobile, mid-level at backend/infrastructure, learning to be better at backend and infra

mental models that grow, right metaphors that aren't too loose or leaky`

const DEFAULT_PREFS: Preferences = {
  explainComplexTermsSimply: true,
  assumePriorKnowledge: false,
  codeExamples: true,
  realWorldAnalogies: true,
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const [aboutMe, setAboutMe] = useState(DEFAULT_ABOUT)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    fetch(apiUrl('/api/profile'))
      .then(res => res.json())
      .then(data => {
        if (data.aboutMe) setAboutMe(data.aboutMe)
        if (data.preferences) setPreferences(data.preferences)
        setLoaded(true)
      })
      .catch(() => {})
  }, [open, loaded])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(apiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aboutMe: aboutMe.trim(), preferences }),
      })
      onOpenChange(false)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const togglePref = (key: keyof Preferences) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Learning Profile</DialogTitle>
          <DialogDescription>
            Tell us about yourself. This shapes how books are written for you.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label htmlFor="about-me" className="text-sm font-medium text-content-primary">
              About Me
            </label>
            <textarea
              id="about-me"
              value={aboutMe}
              onChange={e => setAboutMe(e.target.value)}
              rows={4}
              className="resize-none rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              placeholder="Your background, experience level, what you're trying to learn..."
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium text-content-primary">Preferences</span>
            {(Object.keys(PREF_LABELS) as Array<keyof Preferences>).map(key => (
              <label key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-content-secondary">{PREF_LABELS[key]}</span>
                <button
                  type="button"
                  onClick={() => togglePref(key)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    preferences[key] ? 'bg-[oklch(0.55_0.20_285)]' : 'bg-content-muted/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
                      preferences[key] ? 'translate-x-4' : 'translate-x-0.5'
                    } translate-y-0.5`}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
