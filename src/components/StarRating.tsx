import { useState } from 'react'
import { Star } from 'lucide-react'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function StarRating({ value, onChange, readonly = false, size = 'md' }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const displayValue = hoverValue ?? value

  const sizeClass = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-6'
  const gapClass = size === 'sm' ? 'gap-0.5' : size === 'lg' ? 'gap-1.5' : 'gap-1'

  return (
    <div
      className={`inline-flex ${gapClass}`}
      onMouseLeave={() => !readonly && setHoverValue(null)}
    >
      {[1, 2, 3, 4, 5].map(star => {
        const filled = displayValue >= star
        const halfFilled = !filled && displayValue >= star - 0.5

        return (
          <div key={star} className={`relative ${readonly ? '' : 'cursor-pointer'}`}>
            {/* Full star background (empty) */}
            <Star className={`${sizeClass} text-content-muted/20`} />

            {/* Filled overlay */}
            {(filled || halfFilled) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? '100%' : '50%' }}
              >
                <Star className={`${sizeClass} fill-amber-400 text-amber-400`} />
              </div>
            )}

            {/* Click targets — left half = X.5, right half = X.0 */}
            {!readonly && (
              <>
                <div
                  className="absolute inset-y-0 left-0 w-1/2"
                  onMouseEnter={() => setHoverValue(star - 0.5)}
                  onClick={() => onChange?.(star - 0.5)}
                />
                <div
                  className="absolute inset-y-0 right-0 w-1/2"
                  onMouseEnter={() => setHoverValue(star)}
                  onClick={() => onChange?.(star)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
