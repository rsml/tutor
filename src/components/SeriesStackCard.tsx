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

export function SeriesStackCard({ seriesName, books, chaptersRead, totalChapters, onClick, onContextMenu }: SeriesStackCardProps) {
  const hue = stringToHue(seriesName)
  const progress = totalChapters > 0 ? chaptersRead / totalChapters : 0
  const bookCount = books.length

  // Use the first book's cover if available
  const coverBook = books.find(b => b.hasCover)
  const coverUrl = coverBook ? apiUrl(`/api/books/${coverBook.id}/cover?v=${coverBook.coverUpdatedAt ?? ''}`) : undefined

  return (
    <div className="group cursor-pointer" onClick={onClick} onContextMenu={onContextMenu}>
      {/* Stack effect — offset cards behind the main card */}
      <div className="relative">
        {/* Back cards (only show if more than 1 book) */}
        {bookCount > 1 && (
          <>
            {/* Third card (only for 3+) */}
            {bookCount > 2 && (
              <div
                className="absolute top-2.5 -right-3.5 bottom-0 left-3.5 rotate-2 rounded-xl border border-white/10 opacity-40"
                style={{
                  background: `linear-gradient(145deg, oklch(0.35 0.10 ${hue + 30}), oklch(0.20 0.06 ${hue + 60}))`,
                  aspectRatio: '1/1.618',
                }}
              />
            )}
            {/* Second card */}
            <div
              className="absolute top-1 -right-2 bottom-0 left-2 rotate-1 rounded-xl border border-white/10 opacity-60"
              style={{
                background: `linear-gradient(145deg, oklch(0.40 0.13 ${hue + 15}), oklch(0.22 0.08 ${hue + 55}))`,
                aspectRatio: '1/1.618',
              }}
            />
          </>
        )}

        {/* Main card */}
        <div
          className="relative aspect-[1/1.618] overflow-hidden rounded-xl shadow-md transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl"
          style={coverUrl ? undefined : {
            background: `linear-gradient(145deg, oklch(0.45 0.16 ${hue}), oklch(0.25 0.12 ${hue + 50}))`,
          }}
        >
          <div className="relative flex h-full flex-col items-center justify-center p-4">
            {coverUrl ? (
              <>
                <img
                  src={coverUrl}
                  alt={seriesName}
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

                {/* Series name */}
                <h3 className="text-center text-[1.15em] leading-snug font-bold tracking-tight text-white/90">
                  {seriesName}
                </h3>

                {/* Book count */}
                <p className="mt-2 text-center text-[0.75em] text-white/60">
                  {bookCount} {bookCount === 1 ? 'book' : 'books'}
                </p>
              </>
            )}

            {/* Progress bar */}
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
