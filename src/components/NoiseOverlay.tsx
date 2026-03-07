import { useEffect, useRef } from 'react'

let cachedUrl: string | null = null

function getNoiseUrl() {
  if (cachedUrl) return cachedUrl
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const imageData = ctx.createImageData(size, size)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.floor(Math.random() * 255)
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  cachedUrl = canvas.toDataURL()
  return cachedUrl
}

interface NoiseOverlayProps {
  opacity?: number
  position?: 'fixed' | 'absolute'
}

export function NoiseOverlay({ opacity = 1, position = 'fixed' }: NoiseOverlayProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.backgroundImage = `url(${getNoiseUrl()})`
  }, [])

  return (
    <div
      ref={ref}
      className="pointer-events-none inset-0"
      style={{
        position,
        backgroundSize: '128px',
        zIndex: position === 'fixed' ? 9999 : undefined,
        opacity: 0.025 * opacity,
      }}
      aria-hidden="true"
    />
  )
}
