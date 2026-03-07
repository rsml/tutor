import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#2a2f50',
    primaryTextColor: '#ebebed',
    primaryBorderColor: '#3b3e54',
    lineColor: '#83858f',
    secondaryColor: '#2e3040',
    tertiaryColor: '#262838',
    fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro, system-ui, sans-serif',
    fontSize: '14px',
  },
})

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '_')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        // mermaid.render() produces sanitized SVG — safe for injection
        const result = await mermaid.render(`mermaid-${id}`, chart)
        if (!cancelled) setSvg(result.svg)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    render()
    return () => { cancelled = true }
  }, [chart, id])

  if (error) {
    return (
      <div className="my-5 rounded-lg bg-surface-muted p-4 text-content-muted text-sm">
        Failed to render diagram
      </div>
    )
  }

  if (!svg) return null

  return (
    <div
      className="my-5 flex justify-center rounded-lg bg-surface-muted p-4 overflow-x-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
