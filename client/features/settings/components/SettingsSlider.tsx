import type { ReactNode } from 'react'
import { TickSlider } from '@client/components/ui/tick-slider'

interface SettingsSliderProps {
  icon: ReactNode
  label: string
  valueLabel: ReactNode
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  ticks: Array<{ highlight?: boolean; label?: string }>
}

/**
 * One labeled tick-slider row in the settings dropdown. Quiz Length, Default
 * Book Length, Font Size and Reading Width are all this same icon-label-value
 * header over a TickSlider, differing only in their data, so they share this
 * shell rather than repeating its markup four times.
 */
export function SettingsSlider({ icon, label, valueLabel, min, max, value, onChange, ticks }: SettingsSliderProps) {
  return (
    <div className="px-2 pt-1.5 pb-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        {icon}
        {label}
        <span className="ml-auto tabular-nums">{valueLabel}</span>
      </div>
      <TickSlider
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        onPointerDown={e => e.stopPropagation()}
        ticks={ticks}
      />
    </div>
  )
}
