import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SectionTapZonesProps {
  hasPrev: boolean
  hasNext: boolean
  goPrev: () => void
  goNext: () => void
}

/** Invisible-until-hovered buttons over the far left/right content edges,
 *  an alternative to the rail's chevrons for moving a section at a time.
 *
 *  aria-hidden and tabIndex={-1} pull these out of the accessibility tree
 *  and the tab order: ChapterRail already exposes a keyboard-reachable
 *  "Previous section"/"Next section" button wired to the same callback, and
 *  these tap zones are only ever discoverable by hovering, which a keyboard
 *  or screen reader user cannot do. Without aria-hidden, two controls on the
 *  page would share the same accessible name, which assistive technology
 *  announces as one control repeated. The aria-label stays anyway, inert for
 *  real assistive technology once aria-hidden hides the whole node, because
 *  scripts/find-unnamed-buttons.mts has no concept of aria-hidden and would
 *  otherwise flag an icon-only button as unnamed. */
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
            aria-hidden="true"
            tabIndex={-1}
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
            aria-hidden="true"
            tabIndex={-1}
          >
            <ChevronRight className="size-5 text-content-muted" />
          </button>
        </div>
      )}
    </>
  )
}
