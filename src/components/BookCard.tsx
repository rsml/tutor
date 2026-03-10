import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { StarRating } from '@src/components/StarRating'

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
  rating?: number
  finalQuizScore?: number
  finalQuizTotal?: number
  coverUrl?: string
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function BookCard({ title, subtitle, chaptersRead, totalChapters, rating, finalQuizScore, finalQuizTotal, coverUrl, onClick, onContextMenu }: BookCardProps) {
  const hue = stringToHue(title)
  const progress = totalChapters > 0 ? chaptersRead / totalChapters : 0

  return (
    <div className="group cursor-pointer" onClick={onClick} onContextMenu={onContextMenu}>
      {/* Cover */}
      <div
        className="aspect-[1/1.618] overflow-hidden rounded-xl shadow-md transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl"
        style={coverUrl ? undefined : {
          background: `linear-gradient(145deg, oklch(0.45 0.16 ${hue}), oklch(0.25 0.12 ${hue + 50}))`,
        }}
      >
        <div className="relative flex h-full flex-col items-center justify-center p-2">
          {coverUrl ? (
            <>
              <img
                src={coverUrl}
                alt={title}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="relative mt-auto w-full px-2 pb-1">
                <h3 className="text-center text-[1.15em] leading-snug font-bold tracking-tight text-white/90">
                  {title}
                </h3>
                {subtitle && (
                  <p className="mt-1 text-center text-[0.75em] leading-snug text-white/60">
                    {subtitle}
                  </p>
                )}
              </div>
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
          {/* Progress bar — inset with border-radius */}
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

      {/* Meta */}
      <div className="mt-2.5 px-0.5">
        <p className="text-[0.75em] text-content-muted">
          {chaptersRead === 0
            ? `${totalChapters} chapters`
            : `${chaptersRead} of ${totalChapters} chapters`}
        </p>
        {rating != null && rating > 0 && (
          <div className="mt-0.5 flex items-center gap-2">
            <StarRating value={rating} readonly size="sm" />
            {finalQuizScore != null && finalQuizTotal != null && (
              <span className="text-[0.75em] text-content-muted">{finalQuizScore}/{finalQuizTotal}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
