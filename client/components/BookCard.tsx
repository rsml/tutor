import { memo } from 'react'
import { AlertTriangle, Loader2, FileDown, Headphones } from 'lucide-react'
import { NoiseOverlay } from '@client/components/NoiseOverlay'
import { StarRating } from '@client/components/StarRating'
import { isGenerating as isGeneratingBook, isFailed as isFailedBook, isAwaitingTocApproval } from '@shared/book-status'

function stringToHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ((hash % 360) + 360) % 360
}

interface BookCardProps {
  title: string
  subtitle?: string
  chaptersRead: number
  totalChapters: number
  status?: string
  rating?: number
  coverUrl?: string
  showTitleOnCover?: boolean
  imported?: boolean
  hasAudiobook?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

// Layered drop-shadow halo painted behind the hovered card — same recipe as
// SeriesStackCard so single books and series feel like the same physical object.
const HALO_SHADOW = '0 24px 50px -12px rgba(0, 0, 0, 0.45), 0 10px 22px -8px rgba(0, 0, 0, 0.3)'

function BookCardInner({ title, subtitle, chaptersRead, totalChapters, status, rating, coverUrl, showTitleOnCover, imported, hasAudiobook, onClick, onContextMenu }: BookCardProps) {
  const hue = stringToHue(title)
  const progress = totalChapters > 0 ? chaptersRead / totalChapters : 0
  const isGenerating = isGeneratingBook(status)
  const isFailed = isFailedBook(status)

  return (
    <div className={`group relative card-lift ${isGenerating ? 'cursor-default' : 'cursor-pointer'}`} onClick={isGenerating ? undefined : onClick} onContextMenu={isGenerating ? undefined : onContextMenu}>
      <div className="relative">
        {/* Depth halo — fades in on hover to lift the card off the page.
            Sits behind the cover (first DOM child → painted underneath). */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
          style={{ boxShadow: HALO_SHADOW }}
        />
        {/* Cover */}
        <div
          className="relative aspect-[1/1.618] overflow-hidden rounded-xl shadow-md will-change-transform transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl"
          style={coverUrl ? undefined : {
            background: `linear-gradient(145deg, oklch(0.45 0.16 ${hue}), oklch(0.25 0.12 ${hue + 50}))`,
          }}
        >
        <div className="relative flex h-full flex-col items-center justify-center p-2">
          {coverUrl ? (
            <>
              {/* decoding=sync: async lets Chromium paint frames WITHOUT the
                  image while it re-decodes after compositor layer churn (hover
                  scale ends → layer demoted → bitmap re-decode) — shows as a
                  dark flash of the empty card on hover-off. */}
              <img
                src={coverUrl}
                alt={title}
                decoding="sync"
                className="absolute inset-0 h-full w-full object-cover"
              />
              {showTitleOnCover && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="relative w-full px-2 pv-5 justify-center align-middle">
                    <h3 className="text-center text-[1.2em] leading-7 font-extrabold tracking-wider text-white [text-shadow:0_1px_3px_rgba(0,0,0,1),0_4px_12px_rgba(0,0,0,0.9),0_7px_21px_rgba(0,0,0,0.6),0_11px_33px_rgba(0,0,0,0.4)]">
                      {title}
                    </h3>
                    {subtitle && (
                      <p className="mt-3 font-medium text-center text-[0.8em] leading-snug tracking-normal text-white/95 [text-shadow:0_1px_3px_rgba(0,0,0,1),0_4px_12px_rgba(0,0,0,0.9),0_7px_21px_rgba(0,0,0,0.8),0_11px_33px_rgba(0,0,0,0.8),0_6px_18px_rgba(0,0,0,1)]">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <NoiseOverlay opacity={0.5} position="absolute" />
              <h3 className="mt-3 text-center text-[1.15em] leading-snug font-bold tracking-tight text-white/90">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-1 text-center text-[0.75em] leading-snug text-white/60 px-2">
                  {subtitle}
                </p>
              )}
            </>
          )}
          {/* Generating badge */}
          {isGenerating && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-full bg-black/50 px-3 py-1 backdrop-blur-sm">
              <Loader2 className="size-3 animate-spin text-white/80" />
              <span className="text-xs font-medium text-white/80">
                Generating...
              </span>
            </div>
          )}
          {/* Failed badge */}
          {isFailed && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-full bg-red-900/60 px-3 py-1 backdrop-blur-sm">
              <AlertTriangle className="size-3 text-red-300" />
              <span className="text-xs font-medium text-red-200">
                Failed
              </span>
            </div>
          )}
          {/* Awaiting approval badge (toc_review status) */}
          {isAwaitingTocApproval(status) && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-center rounded-full border border-border-default/60 bg-transparent px-3 py-1 backdrop-blur-sm">
              <span className="text-xs font-medium text-content-muted">
                Awaiting approval
              </span>
            </div>
          )}
          {/* Imported badge */}
          {imported && !isGenerating && !isFailed && progress === 0 && (
            <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-sm">
              <FileDown className="size-3 text-blue-300/80" />
              <span className="text-[0.65em] font-medium text-blue-200/80">
                Imported
              </span>
            </div>
          )}
          {/* Progress bar — inset with border-radius */}
          {!isGenerating && progress > 0 && (
            <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white/70 transition-all duration-500"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-2.5 px-0.5">
        <div className="flex items-center gap-1.5">
          {hasAudiobook && (
            <Headphones
              className="size-3 text-content-muted/70"
              aria-label="Audiobook available"
            />
          )}
          <p className="text-[0.75em] text-content-muted">
            {chaptersRead === 0
              ? `${totalChapters} chapters`
              : `${chaptersRead} of ${totalChapters} chapters`}
          </p>
        </div>
        {rating != null && rating > 0 && (
          <div className="mt-0.5">
            <StarRating value={rating} readonly size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}

// Value-equality memo: BookCard is rendered inside a large list, and the parent
// passes fresh onClick/onContextMenu closures plus an inline-computed coverUrl
// string on every render. Compare by value so identical state skips re-render
// (callback identity is irrelevant — they're invoked from DOM events, not stored).
export const BookCard = memo(BookCardInner, (a, b) =>
  a.title === b.title &&
  a.subtitle === b.subtitle &&
  a.chaptersRead === b.chaptersRead &&
  a.totalChapters === b.totalChapters &&
  a.status === b.status &&
  a.rating === b.rating &&
  a.coverUrl === b.coverUrl &&
  a.showTitleOnCover === b.showTitleOnCover &&
  a.imported === b.imported &&
  a.hasAudiobook === b.hasAudiobook,
)
