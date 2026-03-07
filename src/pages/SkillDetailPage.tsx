import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { ProgressStats } from '@src/components/ProgressStats'
import { OverlaidBar } from '@src/components/OverlaidBar'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { apiUrl } from '@src/lib/api-base'

interface SkillProgress {
  name: string
  totalWeight: number
  completedWeight: number
  books: Array<{ bookId: string; title: string; weight: number; completed: boolean }>
  subskills: Array<{ name: string; totalWeight: number; completedWeight: number }>
}

interface SkillsResponse {
  stats: { totalBooks: number; completedBooks: number; totalChapters: number; completedChapters: number }
  skills: SkillProgress[]
}

interface SkillDetailPageProps {
  skillName: string
  onBack: () => void
}

export function SkillDetailPage({ skillName, onBack }: SkillDetailPageProps) {
  const [data, setData] = useState<SkillsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(apiUrl('/api/progress/skills'))
      .then(res => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <NoiseOverlay />
        <Loader2 className="size-6 animate-spin text-content-muted" />
      </div>
    )
  }

  const skill = data?.skills.find(s => s.name === skillName)

  if (!skill) {
    return (
      <div className="flex h-screen flex-col text-content-primary">
        <NoiseOverlay />
        <header
          className="relative flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-content-muted">Skill not found.</p>
        </div>
      </div>
    )
  }

  const booksWithSkill = skill.books.length
  const booksCompleted = skill.books.filter(b => b.completed).length

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />
      <header
        className="relative flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to progress">
            <ArrowLeft className="size-4" />
          </Button>
        </div>
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          {skillName}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <ProgressStats
            stats={[
              { label: 'Books with skill', value: booksWithSkill },
              { label: 'Books completed', value: booksCompleted },
              { label: 'Skill weight', value: `${skill.completedWeight} / ${skill.totalWeight}` },
              { label: 'Sub-skills', value: skill.subskills.length },
            ]}
          />

          {skill.subskills.length > 0 && (
            <div>
              <h2 className="mb-4 text-base font-semibold text-content-primary">Sub-skills</h2>
              <div className="space-y-5">
                {skill.subskills.map((sub) => (
                  <OverlaidBar
                    key={sub.name}
                    label={sub.name}
                    total={sub.totalWeight}
                    completed={sub.completedWeight}
                    colorClass="bg-[oklch(0.60_0.15_285)]"
                  />
                ))}
              </div>
            </div>
          )}

          {skill.books.length > 0 && (
            <div>
              <h2 className="mb-4 text-base font-semibold text-content-primary">Books</h2>
              <div className="space-y-2">
                {skill.books.map((book) => (
                  <div
                    key={book.bookId}
                    className="flex items-center justify-between rounded-lg border border-border-default/50 bg-surface-base/80 px-4 py-2.5 backdrop-blur-md"
                  >
                    <span className="text-sm text-content-primary truncate">{book.title}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-content-muted">
                        weight {book.weight}
                      </span>
                      <span className={`size-2 rounded-full ${book.completed ? 'bg-status-ok' : 'bg-content-muted/30'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
