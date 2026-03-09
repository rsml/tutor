import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, GitCompareArrows, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { ProfileDiffView, type DiffChange } from '@src/components/ProfileDiffView'
import { ProfileEditView } from '@src/components/ProfileEditView'
import { type Skill, type Preferences, BOOL_PREF_LABELS, SLIDER_PREFS, DEFAULT_PREFS } from '@src/lib/profile-constants'
import { useAppSelector, selectFunctionModel } from '@src/store'
import { apiUrl } from '@src/lib/api-base'
import { cn } from '@src/lib/utils'

interface ProfileSuggestions {
  rationale: string
  skills: {
    added: Array<{ name: string; level: number }>
    removed: string[]
    updated: Array<{ name: string; oldLevel: number; newLevel: number }>
  }
  preferences: Array<{ key: string; oldValue: boolean | number; newValue: boolean | number }>
  aboutMe: string
}

interface CurrentProfile {
  aboutMe: string
  skills: Skill[]
  preferences: Preferences
}

const SLIDER_LABELS: Record<string, string[]> = {
  depthLevel: ['Overview', 'Light', 'Balanced', 'Detailed', 'Comprehensive'],
  pacePreference: ['Deliberate', 'Measured', 'Moderate', 'Brisk', 'Fast'],
  metaphorDensity: ['Very rare', 'Occasional', 'Moderate', 'Frequent', 'Very frequent'],
  narrativeStyle: ['Technical', 'Mostly tech', 'Balanced', 'Mostly narrative', 'Narrative'],
  humorLevel: ['Serious', 'Mostly serious', 'Light humor', 'Playful', 'Witty'],
  formalityLevel: ['Very casual', 'Casual', 'Balanced', 'Somewhat academic', 'Academic'],
}

export function ProfileUpdatePage({ bookId, bookTitle, onComplete }: {
  bookId: string
  bookTitle: string
  onComplete: () => void
}) {
  const [suggestions, setSuggestions] = useState<ProfileSuggestions | null>(null)
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({})
  const [editOverrides, setEditOverrides] = useState<CurrentProfile | null>(null)
  const [activeTab, setActiveTab] = useState<'diff' | 'edit'>('diff')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { provider, model } = useAppSelector(selectFunctionModel('generation'))

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Fetch current profile
        const profileRes = await fetch(apiUrl('/api/profile'))
        const profileData = await profileRes.json()
        const profile: CurrentProfile = {
          aboutMe: profileData.aboutMe ?? profileData.identity ?? '',
          skills: profileData.skills ?? [],
          preferences: { ...DEFAULT_PREFS, ...profileData.preferences },
        }
        if (!cancelled) setCurrentProfile(profile)

        // Fetch AI suggestions
        const suggestRes = await fetch(apiUrl(`/api/books/${bookId}/profile-suggestions`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, provider }),
        })
        if (!suggestRes.ok) throw new Error('Failed to generate suggestions')
        const suggestData = await suggestRes.json()
        if (!cancelled) {
          setSuggestions(suggestData)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [bookId, model, provider])

  // Build diff changes from suggestions
  const { skillChanges, preferenceChanges } = useMemo(() => {
    if (!suggestions) return { skillChanges: [], preferenceChanges: [] }

    const sc: DiffChange[] = []
    for (const s of suggestions.skills.added) {
      sc.push({ id: `skill-add-${s.name}`, type: 'added', label: s.name, newValue: `${s.level}/10` })
    }
    for (const name of suggestions.skills.removed) {
      sc.push({ id: `skill-remove-${name}`, type: 'removed', label: name })
    }
    for (const s of suggestions.skills.updated) {
      sc.push({ id: `skill-update-${s.name}`, type: 'changed', label: s.name, oldValue: `${s.oldLevel}/10`, newValue: `${s.newLevel}/10` })
    }

    const pc: DiffChange[] = []
    for (const p of suggestions.preferences) {
      const boolLabel = BOOL_PREF_LABELS[p.key]
      const sliderPref = SLIDER_PREFS.find(sp => sp.key === p.key)

      if (boolLabel) {
        pc.push({
          id: `pref-${p.key}`,
          type: 'changed',
          label: boolLabel,
          oldValue: p.oldValue ? 'On' : 'Off',
          newValue: p.newValue ? 'On' : 'Off',
        })
      } else if (sliderPref) {
        const labels = SLIDER_LABELS[p.key]
        const oldLabel = labels?.[(p.oldValue as number) - 1] ?? `${p.oldValue}`
        const newLabel = labels?.[(p.newValue as number) - 1] ?? `${p.newValue}`
        pc.push({
          id: `pref-${p.key}`,
          type: 'changed',
          label: sliderPref.label,
          oldValue: `${oldLabel} (${p.oldValue}/5)`,
          newValue: `${newLabel} (${p.newValue}/5)`,
        })
      }
    }

    return { skillChanges: sc, preferenceChanges: pc }
  }, [suggestions])

  // Merged profile: applies accepted suggestions to currentProfile
  const mergedProfile = useMemo((): CurrentProfile | null => {
    if (!currentProfile || !suggestions) return currentProfile

    let skills = [...currentProfile.skills]

    // Apply skill additions
    for (const s of suggestions.skills.added) {
      const id = `skill-add-${s.name}`
      if ((decisions[id] ?? 'accepted') === 'accepted') {
        if (!skills.some(sk => sk.name.toLowerCase() === s.name.toLowerCase())) {
          skills.push({ name: s.name, level: s.level })
        }
      }
    }

    // Apply skill removals
    for (const name of suggestions.skills.removed) {
      const id = `skill-remove-${name}`
      if ((decisions[id] ?? 'accepted') === 'accepted') {
        skills = skills.filter(s => s.name.toLowerCase() !== name.toLowerCase())
      }
    }

    // Apply skill updates
    for (const s of suggestions.skills.updated) {
      const id = `skill-update-${s.name}`
      if ((decisions[id] ?? 'accepted') === 'accepted') {
        skills = skills.map(sk =>
          sk.name.toLowerCase() === s.name.toLowerCase()
            ? { ...sk, level: s.newLevel }
            : sk
        )
      }
    }

    // Apply preference changes
    const prefs = { ...currentProfile.preferences }
    for (const p of suggestions.preferences) {
      const id = `pref-${p.key}`
      if ((decisions[id] ?? 'accepted') === 'accepted') {
        ;(prefs as Record<string, unknown>)[p.key] = p.newValue
      }
    }

    // Apply aboutMe
    const aboutMe = (decisions['aboutMe'] ?? 'accepted') === 'accepted'
      ? suggestions.aboutMe
      : currentProfile.aboutMe

    return { skills, preferences: prefs, aboutMe }
  }, [currentProfile, suggestions, decisions])

  const finalProfile = editOverrides ?? mergedProfile

  const handleDecision = useCallback((id: string, decision: 'accepted' | 'rejected') => {
    setDecisions(prev => ({ ...prev, [id]: decision }))
    // Clear edit overrides when diff decisions change so merged profile is recalculated
    setEditOverrides(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!finalProfile) return
    setSaving(true)
    try {
      await fetch(apiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aboutMe: finalProfile.aboutMe.trim(),
          preferences: finalProfile.preferences,
          skills: finalProfile.skills,
        }),
      })
      onComplete()
    } catch {
      setError('Failed to save profile')
      setSaving(false)
    }
  }, [finalProfile, onComplete])

  return (
    <div className="flex h-screen flex-col text-content-primary">
      {/* Header */}
      <header
        className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          {bookTitle}
        </span>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {/* Back button */}
        <button
          onClick={onComplete}
          className="absolute left-6 top-3 z-20 inline-flex items-center gap-1.5 p-2 text-content-muted/50 transition-colors hover:text-content-muted"
        >
          <ArrowLeft className="size-5" />
        </button>

        <main className="h-full overflow-y-auto pt-12">
          <div className="mx-auto max-w-xl px-8 pb-24">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Loader2 className="size-6 animate-spin text-content-muted" />
                <p className="mt-3 text-sm text-content-muted">Analyzing your learning journey...</p>
              </div>
            ) : error && !suggestions ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <p className="text-sm text-content-muted">{error}</p>
                <button
                  onClick={onComplete}
                  className="mt-4 text-sm text-content-muted/70 underline underline-offset-2 hover:text-content-muted"
                >
                  Skip and return to library
                </button>
              </div>
            ) : suggestions && currentProfile ? (
              <>
                <h1 className="text-3xl font-bold tracking-tight">Way to go!</h1>
                <p className="mt-2 text-sm text-content-secondary leading-relaxed">
                  Here are some suggested updates to your learning profile based on your performance.
                </p>

                {/* AI rationale */}
                <div className="mt-4 rounded-lg border border-border-default/50 bg-surface-raised/30 px-4 py-3">
                  <p className="text-sm text-content-secondary leading-relaxed">{suggestions.rationale}</p>
                </div>

                {/* Tab bar */}
                <div className="mt-6 flex gap-4 border-b border-border-default/50">
                  <button
                    onClick={() => setActiveTab('diff')}
                    className={cn(
                      'relative flex items-center gap-1.5 pb-2 text-sm font-medium transition-colors',
                      activeTab === 'diff' ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary',
                    )}
                  >
                    <GitCompareArrows className="size-3.5" />
                    Diff
                    {activeTab === 'diff' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-content-primary rounded-full" />}
                  </button>
                  <button
                    onClick={() => {
                      // Snapshot merged profile into edit overrides on first switch to edit
                      if (!editOverrides && mergedProfile) {
                        setEditOverrides({ ...mergedProfile })
                      }
                      setActiveTab('edit')
                    }}
                    className={cn(
                      'relative flex items-center gap-1.5 pb-2 text-sm font-medium transition-colors',
                      activeTab === 'edit' ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary',
                    )}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                    {activeTab === 'edit' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-content-primary rounded-full" />}
                  </button>
                </div>

                {/* Content */}
                <div className="mt-4">
                  {activeTab === 'diff' ? (
                    <ProfileDiffView
                      skillChanges={skillChanges}
                      preferenceChanges={preferenceChanges}
                      aboutMeOld={currentProfile.aboutMe}
                      aboutMeNew={suggestions.aboutMe}
                      decisions={decisions}
                      onDecision={handleDecision}
                    />
                  ) : editOverrides ? (
                    <ProfileEditView
                      skills={editOverrides.skills}
                      preferences={editOverrides.preferences}
                      aboutMe={editOverrides.aboutMe}
                      onSkillsChange={skills => setEditOverrides(prev => prev ? { ...prev, skills } : prev)}
                      onPreferencesChange={preferences => setEditOverrides(prev => prev ? { ...prev, preferences } : prev)}
                      onAboutMeChange={aboutMe => setEditOverrides(prev => prev ? { ...prev, aboutMe } : prev)}
                    />
                  ) : null}
                </div>

                {/* Footer buttons */}
                <div className="mt-8 flex items-center justify-between">
                  <button
                    onClick={onComplete}
                    className="text-sm text-content-muted/70 underline underline-offset-2 hover:text-content-muted"
                  >
                    Skip
                  </button>
                  <Button
                    size="lg"
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
                  >
                    {saving ? 'Saving...' : 'Save & Return to Library'}
                  </Button>
                </div>

                {error && (
                  <p className="mt-3 text-xs text-red-400 text-right">{error}</p>
                )}
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}
