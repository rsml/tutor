import { Layers } from 'lucide-react'

interface TextureControlProps {
  enabled: boolean
  opacity: number
  onToggle: () => void
  onOpacityChange: (opacity: number) => void
}

/** The Texture row in the settings dropdown: a toggle, plus an opacity slider that only shows once texture is on. */
export function TextureControl({ enabled, opacity, onToggle, onOpacityChange }: TextureControlProps) {
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <Layers className="size-3.5" />
        Texture
        <button
          onClick={onToggle}
          onPointerDown={e => e.stopPropagation()}
          aria-label="Toggle texture"
          aria-pressed={enabled}
          className={`ml-auto relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${
            enabled ? 'bg-[oklch(0.55_0.20_285)]' : 'bg-content-muted/30'
          }`}
        >
          <span
            className={`pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? 'translate-x-3.5' : 'translate-x-0.5'
            } translate-y-0.5`}
          />
        </button>
      </div>
      {enabled && (
        <div className="px-1">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={e => onOpacityChange(parseInt(e.target.value) / 100)}
            className="w-full cursor-pointer"
            style={{ '--range-fill': `${Math.round(opacity * 100)}%` } as React.CSSProperties}
            onPointerDown={e => e.stopPropagation()}
          />
          <div className="flex justify-between text-[9px] text-content-muted -mt-0.5 px-0.5">
            <span>Subtle</span>
            <span>Heavy</span>
          </div>
        </div>
      )}
    </div>
  )
}
