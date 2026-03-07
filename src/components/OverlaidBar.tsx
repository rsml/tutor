interface OverlaidBarProps {
  label: string
  total: number
  completed: number
  onClick?: () => void
  colorClass?: string
}

export function OverlaidBar({
  label,
  total,
  completed,
  onClick,
  colorClass = 'bg-[oklch(0.55_0.20_285)]',
}: OverlaidBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`group w-full text-left ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className={`text-sm font-medium text-content-primary truncate ${onClick ? 'group-hover:text-[oklch(0.65_0.20_285)]' : ''} transition-colors`}>
          {label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-content-muted">
          {completed} / {total}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-content-muted/15">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  )
}
