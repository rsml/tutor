import { cn } from "@src/lib/utils"

interface Tick {
  label?: string
  highlight?: boolean
}

interface TickSliderProps {
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  ticks?: Tick[]
  className?: string
  onPointerDown?: React.PointerEventHandler
}

export function TickSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  ticks,
  className,
  onPointerDown,
}: TickSliderProps) {
  const tickCount = ticks?.length ?? Math.floor((max - min) / step) + 1
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  const hasLabels = ticks?.some(t => t.label)

  return (
    <div className={cn("relative px-1", hasLabels && "pb-4", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer"
        style={{ '--range-fill': `${fill}%` } as React.CSSProperties}
        onPointerDown={onPointerDown}
      />
      <div className="flex justify-between px-2 -mt-0.5">
        {Array.from({ length: tickCount }, (_, i) => {
          const tick = ticks?.[i]
          const hl = tick?.highlight
          return (
            <div
              key={i}
              className={`relative flex flex-col items-center ${hl ? 'text-content-primary' : 'text-content-muted/40'}`}
            >
              <div className={`h-1.5 w-px ${hl ? 'bg-content-primary' : 'bg-content-muted/30'}`} />
              {tick?.label && (
                <span className={`absolute top-2 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap ${hl ? '' : 'text-content-muted/50'}`}>
                  {tick.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
