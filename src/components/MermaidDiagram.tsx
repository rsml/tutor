import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    // Base
    background: 'transparent',
    fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro, system-ui, sans-serif',
    fontSize: '14px',

    // Primary palette (nodes, arrows)
    primaryColor: '#2a2f50',
    primaryTextColor: '#ebebed',
    primaryBorderColor: '#3b3e54',
    secondaryColor: '#2e3040',
    secondaryTextColor: '#ebebed',
    secondaryBorderColor: '#3b3e54',
    tertiaryColor: '#262838',
    tertiaryTextColor: '#ebebed',
    tertiaryBorderColor: '#3b3e54',

    // Lines & edges
    lineColor: '#83858f',
    edgeLabelBackground: '#262838',
    labelTextColor: '#c0c2ca',

    // Node defaults (flowchart)
    nodeBorder: '#3b3e54',
    nodeTextColor: '#ebebed',

    // Cluster / subgraph
    clusterBkg: '#1e2030',
    clusterBorder: '#3b3e54',

    // Color scale overrides (prevents pastel defaults)
    cScale0: '#2a2f50',
    cScale1: '#2e3040',
    cScale2: '#262838',
    cScale3: '#32364d',
    cScale4: '#2b3045',
    cScale5: '#29304a',
    cScale6: '#2d2f44',
    cScale7: '#313550',
    cScale8: '#282c42',
    cScale9: '#2f3348',
    cScale10: '#2a2e43',
    cScale11: '#33374f',

    // Note styling
    noteBkgColor: '#2e3040',
    noteTextColor: '#c0c2ca',
    noteBorderColor: '#3b3e54',

    // Sequence diagram specific
    actorBkg: '#2a2f50',
    actorTextColor: '#ebebed',
    actorBorder: '#3b3e54',
    activationBorderColor: '#3b3e54',
    activationBkgColor: '#2e3040',
    signalColor: '#c0c2ca',

    // State diagram
    labelColor: '#c0c2ca',

    // Pie chart
    pie1: '#3b5bdb',
    pie2: '#5c7cfa',
    pie3: '#748ffc',
    pie4: '#91a7ff',
    pie5: '#bac8ff',
    pie6: '#dbe4ff',
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
