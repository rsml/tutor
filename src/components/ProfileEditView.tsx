import { X } from 'lucide-react'
import { useState } from 'react'
import { type Skill, type Preferences, BOOL_PREF_LABELS, BOOL_KEYS, SLIDER_PREFS } from '@src/lib/profile-constants'

interface ProfileEditViewProps {
  skills: Skill[]
  preferences: Preferences
  aboutMe: string
  onSkillsChange: (skills: Skill[]) => void
  onPreferencesChange: (prefs: Preferences) => void
  onAboutMeChange: (text: string) => void
}

export function ProfileEditView({ skills, preferences, aboutMe, onSkillsChange, onPreferencesChange, onAboutMeChange }: ProfileEditViewProps) {
  const [newSkillName, setNewSkillName] = useState('')

  const setLevel = (index: number, level: number) => {
    const next = [...skills]
    next[index] = { ...next[index], level }
    onSkillsChange(next)
  }

  const removeSkill = (index: number) => {
    onSkillsChange(skills.filter((_, i) => i !== index))
  }

  const addSkill = () => {
    const name = newSkillName.trim()
    if (!name || skills.some(s => s.name.toLowerCase() === name.toLowerCase())) return
    onSkillsChange([...skills, { name, level: 5 }])
    setNewSkillName('')
  }

  const togglePref = (key: string) => {
    onPreferencesChange({ ...preferences, [key]: !preferences[key as keyof Preferences] })
  }

  const setSlider = (key: string, value: number) => {
    onPreferencesChange({ ...preferences, [key]: value })
  }

  return (
    <div className="space-y-6">
      {/* Skills */}
      <div>
        <h3 className="text-sm font-medium text-content-primary mb-2">Skills</h3>
        <div className="space-y-2">
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
        </div>
      </div>

      {/* Preferences */}
      <div>
        <h3 className="text-sm font-medium text-content-primary mb-2">Preferences</h3>
        <div className="space-y-2">
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
      </div>

      {/* Style sliders */}
      <div>
        <h3 className="text-sm font-medium text-content-primary mb-2">Style</h3>
        <div className="space-y-3">
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

      {/* About Me */}
      <div>
        <h3 className="text-sm font-medium text-content-primary mb-2">About Me</h3>
        <textarea
          value={aboutMe}
          onChange={e => onAboutMeChange(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          placeholder="Your background, experience level, what you're trying to learn..."
        />
      </div>
    </div>
  )
}
