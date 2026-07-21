import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import { useAppSelector, selectFunctionModel, selectHasApiKeyForFunction } from '@client/store'
import { saveProfile, suggestSkills } from '@client/api'
import { useLearningProfile } from '@client/features/profile/hooks/useLearningProfile'
import { type Skill, type Preferences, DEFAULT_PREFS } from '@client/lib/profile-constants'
import { SKILL_SAVE_DEBOUNCE_MS } from '@client/lib/constants'

interface SkillsPanelProps {
  open: boolean
  onClose: () => void
}

export function SkillsPanel({ open, onClose }: SkillsPanelProps) {
  const { provider, model } = useAppSelector(selectFunctionModel('profile'))
  const hasApiKey = useAppSelector(selectHasApiKeyForFunction('profile'))
  const { refresh } = useLearningProfile()

  const [skills, setSkills] = useState<Skill[]>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Cache profile data for saves
  const profileCache = useRef<{ aboutMe: string; preferences: Preferences }>({
    aboutMe: '',
    preferences: DEFAULT_PREFS,
  })

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSave = useCallback((updatedSkills: Skill[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveProfile({
          aboutMe: profileCache.current.aboutMe,
          preferences: profileCache.current.preferences,
          skills: updatedSkills,
        })
      } catch { /* silent */ }
    }, SKILL_SAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoaded(false)
    refresh().then(data => {
      if (data) {
        profileCache.current = {
          aboutMe: data.aboutMe ?? '',
          preferences: { ...DEFAULT_PREFS, ...data.preferences },
        }
        setSkills(data.skills ?? [])
      }
      setLoaded(true)
    })
  }, [open, refresh])

  // Escape closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Cleanup save timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const addSkill = () => {
    const name = newSkillName.trim()
    if (!name) return
    if (skills.some(s => s.name.toLowerCase() === name.toLowerCase())) return
    const updated = [...skills, { name, level: 5 }]
    setSkills(updated)
    setNewSkillName('')
    debouncedSave(updated)
  }

  const removeSkill = (index: number) => {
    const updated = skills.filter((_, i) => i !== index)
    setSkills(updated)
    debouncedSave(updated)
  }

  const setLevel = (index: number, level: number) => {
    const updated = skills.map((s, i) => i === index ? { ...s, level } : s)
    setSkills(updated)
    debouncedSave(updated)
  }

  const handleSuggest = async () => {
    if (!hasApiKey || suggesting) return
    setSuggesting(true)
    try {
      const suggested = await suggestSkills({
        model,
        provider,
        aboutMe: profileCache.current.aboutMe,
        existingSkills: skills,
      })
      if (suggested.length) {
        const existingNames = new Set(skills.map(s => s.name.toLowerCase()))
        const newSkills = suggested.filter(s => !existingNames.has(s.name.toLowerCase()))
        if (newSkills.length > 0) {
          const updated = [...skills, ...newSkills]
          setSkills(updated)
          debouncedSave(updated)
        }
      }
    } catch { /* silent */ }
    setSuggesting(false)
  }

  if (!open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border-default/50 bg-surface-base/95 backdrop-blur-md shadow-2xl"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-default/50 px-4">
          <span className="text-sm font-medium text-content-primary">Prior Knowledge</span>
          <button
            onClick={onClose}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary"
          >
            <X className="size-4 pointer-events-none" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!loaded ? (
            <div className="flex items-center justify-center py-8 text-content-muted">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <>
              {skills.map((skill, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-content-primary flex-1 min-w-0 truncate">{skill.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={skill.level}
                      onChange={e => setLevel(i, parseInt(e.target.value))}
                      className="w-20 cursor-pointer"
                      style={{ '--range-fill': `${((skill.level - 1) / 9) * 100}%` } as React.CSSProperties}
                    />
                    <span className="text-xs tabular-nums text-content-muted w-7 text-right">{skill.level}/10</span>
                  </div>
                  <button
                    onClick={() => removeSkill(i)}
                    className="rounded-md p-0.5 text-content-muted/50 transition-colors hover:text-content-primary"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}

              {/* Add skill input */}
              <div className="pt-1">
                <input
                  type="text"
                  value={newSkillName}
                  onChange={e => setNewSkillName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSkill()
                    }
                  }}
                  placeholder="Add a skill (Enter to add)"
                  className="w-full h-8 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border-default/50 p-3">
          <Button
            variant="outline"
            className="w-full gap-2 border-[var(--color-ai)]/30 text-[var(--color-ai)] hover:bg-[var(--color-ai)]/10 hover:text-[var(--color-ai-hover)]"
            onClick={handleSuggest}
            disabled={suggesting || !hasApiKey || !loaded}
          >
            {suggesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Suggest Skills
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
