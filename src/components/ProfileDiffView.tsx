import { diffWords } from 'diff'
import { Check, X } from 'lucide-react'
import { cn } from '@src/lib/utils'

export interface DiffChange {
  id: string
  type: 'added' | 'removed' | 'changed'
  label: string
  oldValue?: string
  newValue?: string
}

interface ProfileDiffViewProps {
  skillChanges: DiffChange[]
  preferenceChanges: DiffChange[]
  aboutMeOld: string
  aboutMeNew: string
  decisions: Record<string, 'accepted' | 'rejected'>
  onDecision: (id: string, decision: 'accepted' | 'rejected') => void
}

function DecisionButtons({ id, decisions, onDecision }: { id: string; decisions: Record<string, 'accepted' | 'rejected'>; onDecision: (id: string, d: 'accepted' | 'rejected') => void }) {
  const decision = decisions[id] ?? 'accepted'
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onDecision(id, 'accepted')}
        className={cn(
          'rounded-md p-1 transition-colors',
          decision === 'accepted'
            ? 'text-emerald-400 bg-emerald-400/10'
            : 'text-content-muted/40 hover:text-emerald-400',
        )}
        aria-label="Accept change"
      >
        <Check className="size-3.5" />
      </button>
      <button
        onClick={() => onDecision(id, 'rejected')}
        className={cn(
          'rounded-md p-1 transition-colors',
          decision === 'rejected'
            ? 'text-red-400 bg-red-400/10'
            : 'text-content-muted/40 hover:text-red-400',
        )}
        aria-label="Reject change"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function DiffSection({ title, changes, decisions, onDecision }: { title: string; changes: DiffChange[]; decisions: Record<string, 'accepted' | 'rejected'>; onDecision: (id: string, d: 'accepted' | 'rejected') => void }) {
  if (changes.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-medium text-content-primary mb-2">
        {title} <span className="text-content-muted font-normal">({changes.length} change{changes.length !== 1 ? 's' : ''})</span>
      </h3>
      <div className="space-y-1">
        {changes.map(change => {
          const decision = decisions[change.id] ?? 'accepted'
          const rejected = decision === 'rejected'

          return (
            <div
              key={change.id}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 transition-opacity',
                rejected && 'opacity-40',
                change.type === 'added' && 'border-l-2 border-emerald-500/70',
                change.type === 'removed' && 'border-l-2 border-red-500/70',
                change.type === 'changed' && 'border-l-2 border-amber-500/70',
              )}
            >
              <div className="flex-1 min-w-0 text-sm">
                {change.type === 'added' && (
                  <span className="text-emerald-400">+ {change.label} {change.newValue && <span className="text-content-muted">({change.newValue})</span>}</span>
                )}
                {change.type === 'removed' && (
                  <span className="text-red-400">- {change.label}</span>
                )}
                {change.type === 'changed' && (
                  <span>
                    <span className="text-content-secondary">{change.label}: </span>
                    <span className="text-red-400/80 line-through">{change.oldValue}</span>
                    <span className="text-content-muted mx-1.5">&rarr;</span>
                    <span className="text-emerald-400">{change.newValue}</span>
                  </span>
                )}
              </div>
              <DecisionButtons id={change.id} decisions={decisions} onDecision={onDecision} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AboutMeDiff({ oldText, newText, decisions, onDecision }: { oldText: string; newText: string; decisions: Record<string, 'accepted' | 'rejected'>; onDecision: (id: string, d: 'accepted' | 'rejected') => void }) {
  if (oldText === newText) return null

  const segments = diffWords(oldText, newText)
  const hasChanges = segments.some(s => s.added || s.removed)
  if (!hasChanges) return null

  const decision = decisions['aboutMe'] ?? 'accepted'
  const rejected = decision === 'rejected'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-content-primary">
          About Me <span className="text-content-muted font-normal">(1 change)</span>
        </h3>
        <DecisionButtons id="aboutMe" decisions={decisions} onDecision={onDecision} />
      </div>
      <div className={cn(
        'rounded-lg border border-border-default/50 bg-surface-raised/30 p-3 text-sm font-mono leading-relaxed whitespace-pre-wrap transition-opacity',
        rejected && 'opacity-40',
      )}>
        {segments.map((segment, i) => {
          if (segment.removed) {
            return <span key={i} className="text-red-400/80 bg-red-500/10 line-through rounded-sm">{segment.value}</span>
          }
          if (segment.added) {
            return <span key={i} className="text-emerald-400/80 bg-emerald-500/10 rounded-sm">{segment.value}</span>
          }
          return <span key={i} className="text-content-muted/70">{segment.value}</span>
        })}
      </div>
    </div>
  )
}

export function ProfileDiffView({ skillChanges, preferenceChanges, aboutMeOld, aboutMeNew, decisions, onDecision }: ProfileDiffViewProps) {
  return (
    <div className="space-y-6">
      <DiffSection title="Skills" changes={skillChanges} decisions={decisions} onDecision={onDecision} />
      <DiffSection title="Preferences" changes={preferenceChanges} decisions={decisions} onDecision={onDecision} />
      <AboutMeDiff oldText={aboutMeOld} newText={aboutMeNew} decisions={decisions} onDecision={onDecision} />
    </div>
  )
}
