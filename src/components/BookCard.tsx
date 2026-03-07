import { NoiseOverlay } from '@src/components/NoiseOverlay'

function stringToHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ((hash % 360) + 360) % 360
}

interface BookCardProps {
  title: string
  chaptersRead: number
  totalChapters: number
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function BookCard({ title, chaptersRead, totalChapters, onClick, onContextMenu }: BookCardProps) {
  const hue = stringToHue(title)
  const progress = totalChapters > 0 ? chaptersRead / totalChapters : 0

  return (
    <div className="group cursor-pointer" onClick={onClick} onContextMenu={onContextMenu}>
      {/* Cover */}
      <div
        className="aspect-[2/3] overflow-hidden rounded-xl shadow-md transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl"
        style={{
          background: `linear-gradient(145deg, oklch(0.45 0.16 ${hue}), oklch(0.25 0.12 ${hue + 50}))`,
        }}
      >
        <div className="relative flex h-full flex-col items-center justify-center p-5">
          <NoiseOverlay opacity={0.5} position="absolute" />
          <div className="h-px w-8 bg-white/30" />
          <h3 className="mt-3 mb-3 text-center text-[1em] leading-snug font-semibold text-white/90">
            {title}
          </h3>
          <div className="h-px w-8 bg-white/30" />

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
        <p className="line-clamp-1 text-[0.875em] font-medium text-content-primary">
          {title}
        </p>
        <p className="mt-0.5 text-[0.75em] text-content-muted">
          {chaptersRead === 0
            ? `${totalChapters} chapters`
            : `${chaptersRead} of ${totalChapters} chapters`}
        </p>
      </div>
    </div>
  )
}
