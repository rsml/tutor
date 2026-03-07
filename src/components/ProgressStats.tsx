interface StatItem {
  label: string
  value: string | number
  subtitle?: string
}

interface ProgressStatsProps {
  stats: StatItem[]
}

export function ProgressStats({ stats }: ProgressStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-border-default/50 bg-surface-base/80 px-4 py-3 backdrop-blur-md"
        >
          <div className="text-2xl font-bold tabular-nums text-content-primary">
            {stat.value}
          </div>
          <div className="mt-0.5 text-xs text-content-muted">{stat.label}</div>
          {stat.subtitle && (
            <div className="mt-0.5 text-[11px] text-content-muted/60">{stat.subtitle}</div>
          )}
        </div>
      ))}
    </div>
  )
}
