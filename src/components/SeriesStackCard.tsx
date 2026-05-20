import { memo } from 'react'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { apiUrl } from '@src/lib/api-base'

function stringToHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ((hash % 360) + 360) % 360
}

interface Book {
  id: string
  title: string
  hasCover?: boolean
  coverUpdatedAt?: string | null
  showTitleOnCover?: boolean
}

interface SeriesStackCardProps {
  seriesName: string
  books: Book[]
  chaptersRead: number
  totalChapters: number
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

// Apple-style smooth ease-out — borrowed from iOS system curves. Used on the
// fan-out so back cards spread with the same character as a sheet animation.
const FAN_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

// Layered drop-shadow halo painted behind the hovered card. The closer layer
// grounds the card; the wider layer is the soft ambient pool that sells the
// "floating above the page" feel.
const HALO_SHADOW = '0 24px 50px -12px rgba(0, 0, 0, 0.45), 0 10px 22px -8px rgba(0, 0, 0, 0.3)'

function SeriesStackCardInner({ seriesName, books, chaptersRead, totalChapters, onClick, onContextMenu }: SeriesStackCardProps) {
  const hue = stringToHue(seriesName)
  const progress = totalChapters > 0 ? chaptersRead / totalChapters : 0
  const bookCount = books.length

  const coverBook = books.find(b => b.hasCover)
  const coverUrl = coverBook ? apiUrl(`/api/books/${coverBook.id}/cover?v=${coverBook.coverUpdatedAt ?? ''}`) : undefined

  return (
    <div className="group relative cursor-pointer hover:z-10" onClick={onClick} onContextMenu={onContextMenu}>
      {/* Stack effect — offset cards behind the main card. Hover fans them out
          to the upper-right via GPU transforms (no layout thrash); third card
          lags slightly behind the second so the spread feels staggered. */}
      <div className="relative">
        {/* Depth halo — fades in on hover to lift the whole group off the page.
            Sits behind the cards (first DOM child → painted underneath). */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
          style={{ boxShadow: HALO_SHADOW }}
        />
        {bookCount > 1 && (
          <>
            {bookCount > 2 && (
              <div
                className="absolute top-2.5 -right-3.5 bottom-0 left-3.5 rotate-2 rounded-xl border border-white/10 opacity-40 will-change-transform transition-all group-hover:rotate-[7deg] group-hover:translate-x-3 group-hover:opacity-60"
                style={{
                  background: `linear-gradient(145deg, oklch(0.35 0.10 ${hue + 30}), oklch(0.20 0.06 ${hue + 60}))`,
                  aspectRatio: '1/1.618',
                  transitionDuration: '450ms',
                  transitionDelay: '40ms',
                  transitionTimingFunction: FAN_EASE,
                }}
              />
            )}
            <div
              className="absolute top-1 -right-2 bottom-0 left-2 rotate-1 rounded-xl border border-white/10 opacity-60 will-change-transform transition-all group-hover:rotate-[4deg] group-hover:translate-x-1.5 group-hover:opacity-80"
              style={{
                background: `linear-gradient(145deg, oklch(0.40 0.13 ${hue + 15}), oklch(0.22 0.08 ${hue + 55}))`,
                aspectRatio: '1/1.618',
                transitionDuration: '400ms',
                transitionTimingFunction: FAN_EASE,
              }}
            />
          </>
        )}

        {/* Main card */}
        <div
          className="relative aspect-[1/1.618] overflow-hidden rounded-xl shadow-md transition-all group-hover:scale-[1.02] group-hover:shadow-xl"
          style={{
            ...(coverUrl ? {} : {
              background: `linear-gradient(145deg, oklch(0.45 0.16 ${hue}), oklch(0.25 0.12 ${hue + 50}))`,
            }),
            transitionDuration: '300ms',
            transitionTimingFunction: FAN_EASE,
          }}
        >
          <div className="relative flex h-full flex-col items-center justify-center p-4">
            {coverUrl ? (
              <>
                <img
                  src={coverUrl}
                  alt={seriesName}
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                <div className="relative w-full px-2 text-center">
                  <h3 className="text-[1.15em] leading-snug font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,1),0_4px_12px_rgba(0,0,0,0.8)]">
                    {seriesName}
                  </h3>
                  <p className="mt-2 text-[0.75em] text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
                    {bookCount} {bookCount === 1 ? 'book' : 'books'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <NoiseOverlay opacity={0.5} position="absolute" />

                <h3 className="text-center text-[1.15em] leading-snug font-bold tracking-tight text-white/90">
                  {seriesName}
                </h3>

                <p className="mt-2 text-center text-[0.75em] text-white/60">
                  {bookCount} {bookCount === 1 ? 'book' : 'books'}
                </p>
              </>
            )}

            {progress > 0 && (
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
        <p className="text-[0.75em] text-content-muted">
          {chaptersRead === 0
            ? `${totalChapters} chapters total`
            : `${chaptersRead} of ${totalChapters} chapters`}
        </p>
      </div>
    </div>
  )
}

// Memo with value-equality on the data props. The parent allocates a fresh
// `books` array via `filteredBooks.filter(...)` every render, so reference
// equality would force a re-render on every parent update — which is what
// caused the hover flicker. Compare only the fields this card reads.
export const SeriesStackCard = memo(SeriesStackCardInner, (a, b) => {
  if (a.seriesName !== b.seriesName) return false
  if (a.chaptersRead !== b.chaptersRead) return false
  if (a.totalChapters !== b.totalChapters) return false
  if (a.books.length !== b.books.length) return false
  for (let i = 0; i < a.books.length; i++) {
    const x = a.books[i]
    const y = b.books[i]
    if (x.id !== y.id) return false
    if (x.title !== y.title) return false
    if (x.hasCover !== y.hasCover) return false
    if (x.coverUpdatedAt !== y.coverUpdatedAt) return false
    if (x.showTitleOnCover !== y.showTitleOnCover) return false
  }
  return true
})
