interface PageTurnOverlayProps {
  progress: number
  direction: 'next' | 'prev' | null
  isAnimating: boolean
  children: React.ReactNode
  nextPreview?: React.ReactNode
  prevPreview?: React.ReactNode
}

export function PageTurnOverlay({
  progress,
  direction,
  isAnimating,
  children,
  nextPreview,
  prevPreview,
}: PageTurnOverlayProps) {
  const isActive = direction !== null && progress > 0

  if (!isActive) {
    return <>{children}</>
  }

  const willChange = isAnimating ? 'transform, opacity' : undefined

  if (direction === 'next') {
    return (
      <div className="relative h-full" style={{ perspective: '1500px' }}>
        {/* Next chapter preview (behind) */}
        {nextPreview && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              transform: `scale(${0.95 + progress * 0.05})`,
              willChange,
            }}
          >
            {nextPreview}
            {/* Dark overlay that fades out */}
            <div
              className="absolute inset-0 bg-black/40 transition-opacity"
              style={{ opacity: 1 - progress }}
            />
          </div>
        )}

        {/* Current page (rotates away) */}
        <div
          className="absolute inset-0 origin-left overflow-hidden bg-surface-base"
          style={{
            transform: `rotateY(${progress * -120}deg)`,
            backfaceVisibility: 'hidden',
            willChange,
          }}
        >
          {children}
          {/* Shadow on the folding edge */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-16"
            style={{
              background: `linear-gradient(to left, rgba(0,0,0,${progress * 0.15}), transparent)`,
            }}
          />
        </div>
      </div>
    )
  }

  // direction === 'prev'
  return (
    <div className="relative h-full overflow-hidden">
      {/* Prev chapter preview (slides down from top) */}
      {prevPreview && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            transform: `translateY(${(1 - progress) * -20}vh) scale(${0.96 + progress * 0.04})`,
            willChange,
          }}
        >
          {prevPreview}
        </div>
      )}

      {/* Current page (slides down) */}
      <div
        className="absolute inset-0 overflow-hidden bg-surface-base"
        style={{
          transform: `translateY(${progress * 40}vh)`,
          borderTopLeftRadius: `${progress * 24}px`,
          borderTopRightRadius: `${progress * 24}px`,
          boxShadow: `0 ${-progress * 20}px ${progress * 40}px rgba(0,0,0,${progress * 0.1})`,
          willChange,
        }}
      >
        {children}
      </div>
    </div>
  )
}
