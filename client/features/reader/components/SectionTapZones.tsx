import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SectionTapZonesProps {
  hasPrev: boolean
  hasNext: boolean
  goPrev: () => void
  goNext: () => void
}

/** Invisible-until-hovered buttons over the far left/right content edges,
 *  an alternative to the rail's chevrons for moving a section at a time. */
export function SectionTapZones({ hasPrev, hasNext, goPrev, goNext }: SectionTapZonesProps) {
  return (
    <>
      {/* Left tap zone — previous section */}
      {hasPrev && (
        <div className="absolute inset-y-0 left-0 z-10 flex w-16 pointer-events-none items-center justify-center">
          <button
            className="pointer-events-auto cursor-pointer rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm opacity-0 transition-opacity hover:opacity-100"
            onClick={goPrev}
            aria-label="Previous section"
          >
            <ChevronLeft className="size-5 text-content-muted" />
          </button>
        </div>
      )}

      {/* Right tap zone — next section */}
      {hasNext && (
        <div className="absolute inset-y-0 right-0 z-10 flex w-16 pointer-events-none items-center justify-center">
          <button
            className="pointer-events-auto cursor-pointer rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm opacity-0 transition-opacity hover:opacity-100"
            onClick={goNext}
            aria-label="Next section"
          >
            <ChevronRight className="size-5 text-content-muted" />
          </button>
        </div>
      )}
    </>
  )
}
