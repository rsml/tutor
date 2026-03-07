import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, BookOpen } from 'lucide-react'
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

interface ReviewProgressPageProps {
  onBack: () => void
  onSkillClick: (skillName: string) => void
}

export function ReviewProgressPage({ onBack, onSkillClick }: ReviewProgressPageProps) {
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

  const stats = data?.stats
  const skills = data?.skills ?? []
  const completionPct = stats && stats.totalChapters > 0
    ? Math.round((stats.completedChapters / stats.totalChapters) * 100)
    : 0

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />
      <header
        className="relative flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to library">
            <ArrowLeft className="size-4" />
          </Button>
        </div>
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          Review Progress
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl space-y-8">
          {skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <BookOpen className="size-12 text-content-muted/40" />
              <h2 className="mt-4 text-lg font-semibold text-content-primary">No skill data yet</h2>
              <p className="mt-1 text-sm text-content-muted">
                Create a book to start tracking your learning progress.
              </p>
            </div>
          ) : (
            <>
              <ProgressStats
                stats={[
                  { label: 'Books', value: stats?.totalBooks ?? 0 },
                  { label: 'Completed', value: stats?.completedBooks ?? 0 },
                  { label: 'Chapters', value: `${stats?.completedChapters ?? 0} / ${stats?.totalChapters ?? 0}` },
                  { label: 'Completion', value: `${completionPct}%` },
                ]}
              />

              <div>
                <h2 className="mb-4 text-base font-semibold text-content-primary">Skills</h2>
                <div className="space-y-5">
                  {skills.map((skill) => (
                    <OverlaidBar
                      key={skill.name}
                      label={skill.name}
                      total={skill.totalWeight}
                      completed={skill.completedWeight}
                      onClick={() => onSkillClick(skill.name)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
