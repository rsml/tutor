import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { useAppSelector, selectFunctionModel, selectHasApiKey } from '@src/store'
import { apiUrl } from '@src/lib/api-base'

interface Skill {
  name: string
  level: number
}

interface SkillsPanelProps {
  open: boolean
  onClose: () => void
}

export function SkillsPanel({ open, onClose }: SkillsPanelProps) {
  const { provider, model } = useAppSelector(selectFunctionModel('profile'))
  const hasApiKey = useAppSelector(selectHasApiKey)

  const [skills, setSkills] = useState<Skill[]>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Cache profile data for saves
  const profileCache = useRef<{ aboutMe: string; preferences: Record<string, unknown> }>({
    aboutMe: '',
    preferences: {},
  })

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSave = useCallback((updatedSkills: Skill[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(apiUrl('/api/profile'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aboutMe: profileCache.current.aboutMe,
            preferences: profileCache.current.preferences,
            skills: updatedSkills,
          }),
        })
      } catch { /* silent */ }
    }, 300)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoaded(false)
    fetch(apiUrl('/api/profile'))
      .then(res => res.json())
      .then(data => {
        profileCache.current = {
          aboutMe: data.aboutMe ?? '',
          preferences: data.preferences ?? {},
        }
        setSkills(data.skills ?? [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open])

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
      const res = await fetch(apiUrl('/api/profile/suggest-skills'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          provider,
          aboutMe: profileCache.current.aboutMe,
          existingSkills: skills,
        }),
      })
      const data = await res.json()
      if (data.skills?.length) {
        const existingNames = new Set(skills.map(s => s.name.toLowerCase()))
        const newSkills = data.skills.filter(
          (s: Skill) => !existingNames.has(s.name.toLowerCase())
        )
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
      <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border-default/50 bg-surface-base/95 backdrop-blur-md shadow-2xl">
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-default/50 px-4">
          <span className="text-sm font-medium text-content-primary">Prior Knowledge</span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary"
          >
            <X className="size-4" />
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
