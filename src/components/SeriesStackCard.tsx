import { NoiseOverlay } from '@src/components/NoiseOverlay'

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
}

interface SeriesStackCardProps {
  seriesName: string
  books: Book[]
  chaptersRead: number
  totalChapters: number
  onClick: () => void
}

export function SeriesStackCard({ seriesName, books, chaptersRead, totalChapters, onClick }: SeriesStackCardProps) {
  const hue = stringToHue(seriesName)
  const progress = totalChapters > 0 ? chaptersRead / totalChapters : 0

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      {/* Stack effect: two offset shadow layers behind the main card */}
      <div className="relative">
        {/* Bottom shadow layer */}
        <div
          className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl opacity-40"
          style={{
            background: `linear-gradient(145deg, oklch(0.35 0.12 ${hue + 20}), oklch(0.20 0.08 ${hue + 60}))`,
            aspectRatio: '1/1.618',
          }}
        />
        {/* Middle shadow layer */}
        <div
          className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl opacity-60"
          style={{
            background: `linear-gradient(145deg, oklch(0.40 0.14 ${hue + 10}), oklch(0.22 0.10 ${hue + 55}))`,
            aspectRatio: '1/1.618',
          }}
        />

        {/* Main card */}
        <div
          className="relative aspect-[1/1.618] overflow-hidden rounded-xl shadow-md transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl"
          style={{
            background: `linear-gradient(145deg, oklch(0.45 0.16 ${hue}), oklch(0.25 0.12 ${hue + 50}))`,
          }}
        >
          <div className="relative flex h-full flex-col items-center justify-center p-4">
            <NoiseOverlay opacity={0.5} position="absolute" />

            {/* Series icon */}
            <div className="mb-3 flex items-center gap-1">
              <div className="flex -space-x-1">
                {[...Array(Math.min(books.length, 3))].map((_, i) => (
                  <div
                    key={i}
                    className="h-4 w-3 rounded-sm border border-white/30 bg-white/15"
                  />
                ))}
              </div>
            </div>

            {/* Series name */}
            <h3 className="text-center text-[1.15em] leading-snug font-bold tracking-tight text-white/90">
              {seriesName}
            </h3>

            {/* Book count */}
            <p className="mt-2 text-center text-[0.75em] text-white/60">
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </p>

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
