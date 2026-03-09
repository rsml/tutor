import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

// Convert OKLCH color string to hex using canvas (Chromium supports OKLCH natively)
function oklchToHex(oklch: string): string {
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = oklch
  return ctx.fillStyle // returns #rrggbb hex
}

// OKLCH palette for dark mode — perceptually uniform contrast
const P = {
  // Semantic roles
  nodeText:      'oklch(0.93 0.005 260)',
  edgeLabelText: 'oklch(0.85 0.010 260)',
  edgeLine:      'oklch(0.60 0.020 260)',
  nodeBorder:    'oklch(0.42 0.025 260)',
  edgeLabelBg:   'oklch(0.20 0.010 260)',
  clusterBg:     'oklch(0.18 0.012 260)',
  clusterBorder: 'oklch(0.35 0.020 260)',
  noteBg:        'oklch(0.25 0.015 260)',
  noteText:      'oklch(0.82 0.010 260)',

  // Primary / secondary / tertiary fills
  primary:   'oklch(0.30 0.07 250)',
  secondary: 'oklch(0.30 0.07 280)',
  tertiary:  'oklch(0.28 0.04 260)',

  // 12 iso-luminant cScale hues at oklch(0.30 0.07 H)
  cScale: [250, 280, 310, 340, 15, 45, 90, 140, 175, 205, 230, 260]
    .map(h => `oklch(0.30 0.07 ${h})`),
} as const

const themeCSS = `
/* Node shapes */
.node rect, .node polygon, .node circle, .node ellipse,
.node .label-container {
  stroke: ${P.nodeBorder} !important;
}
.nodeLabel, .node .label {
  fill: ${P.nodeText} !important;
  color: ${P.nodeText} !important;
}

/* Edge labels — high contrast */
.edgeLabel {
  background-color: ${P.edgeLabelBg} !important;
  color: ${P.edgeLabelText} !important;
}
.edgeLabel rect {
  fill: ${P.edgeLabelBg} !important;
  opacity: 1 !important;
}
.edgeLabel span, .edgeLabel p {
  color: ${P.edgeLabelText} !important;
}

/* Edge paths */
.edgePath path {
  stroke: ${P.edgeLine} !important;
}
.arrowheadPath, marker path {
  fill: ${P.edgeLine} !important;
  stroke: ${P.edgeLine} !important;
}

/* Clusters / subgraphs */
.cluster rect {
  fill: ${P.clusterBg} !important;
  stroke: ${P.clusterBorder} !important;
}
.cluster span, .cluster .nodeLabel {
  color: ${P.noteText} !important;
  fill: ${P.noteText} !important;
}

/* Sequence diagram */
.actor {
  fill: ${P.primary} !important;
  stroke: ${P.nodeBorder} !important;
}
text.actor > tspan {
  fill: ${P.nodeText} !important;
}
.activation0, .activation1, .activation2 {
  fill: ${P.tertiary} !important;
  stroke: ${P.nodeBorder} !important;
}
line[class^="messageLine"], .messageLine0, .messageLine1 {
  stroke: ${P.edgeLine} !important;
}
.messageText {
  fill: ${P.edgeLabelText} !important;
}
.labelText, .loopText tspan {
  fill: ${P.noteText} !important;
}
.loopLine {
  stroke: ${P.clusterBorder} !important;
}
.note {
  fill: ${P.noteBg} !important;
  stroke: ${P.clusterBorder} !important;
}
.noteText {
  fill: ${P.noteText} !important;
}
`

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeCSS,
  themeVariables: {
    // Base
    background: 'transparent',
    mainBkg: oklchToHex(P.primary),
    fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro, system-ui, sans-serif',
    fontSize: '14px',

    // Primary palette (nodes, arrows)
    primaryColor: oklchToHex(P.primary),
    primaryTextColor: oklchToHex(P.nodeText),
    primaryBorderColor: oklchToHex(P.nodeBorder),
    secondaryColor: oklchToHex(P.secondary),
    secondaryTextColor: oklchToHex(P.nodeText),
    secondaryBorderColor: oklchToHex(P.nodeBorder),
    tertiaryColor: oklchToHex(P.tertiary),
    tertiaryTextColor: oklchToHex(P.nodeText),
    tertiaryBorderColor: oklchToHex(P.nodeBorder),

    // Lines & edges
    lineColor: oklchToHex(P.edgeLine),
    edgeLabelBackground: oklchToHex(P.edgeLabelBg),
    labelTextColor: oklchToHex(P.edgeLabelText),

    // Node defaults (flowchart)
    nodeBorder: oklchToHex(P.nodeBorder),
    nodeTextColor: oklchToHex(P.nodeText),

    // Cluster / subgraph
    clusterBkg: oklchToHex(P.clusterBg),
    clusterBorder: oklchToHex(P.clusterBorder),

    // Color scale overrides (prevents pastel defaults)
    ...Object.fromEntries(P.cScale.flatMap((c, i) => [
      [`cScale${i}`, oklchToHex(c)],
      [`cScalePeer${i}`, oklchToHex(P.nodeText)],
      [`cScaleLabel${i}`, oklchToHex(P.nodeText)],
    ])),

    // Note styling
    noteBkgColor: oklchToHex(P.noteBg),
    noteTextColor: oklchToHex(P.noteText),
    noteBorderColor: oklchToHex(P.clusterBorder),

    // Sequence diagram specific
    actorBkg: oklchToHex(P.primary),
    actorTextColor: oklchToHex(P.nodeText),
    actorBorder: oklchToHex(P.nodeBorder),
    activationBorderColor: oklchToHex(P.nodeBorder),
    activationBkgColor: oklchToHex(P.tertiary),
    signalColor: oklchToHex(P.edgeLabelText),

    // State diagram
    labelColor: oklchToHex(P.edgeLabelText),

    // Pie chart — use cScale hues for variety
    pie1: oklchToHex(P.cScale[0]),
    pie2: oklchToHex(P.cScale[1]),
    pie3: oklchToHex(P.cScale[4]),
    pie4: oklchToHex(P.cScale[5]),
    pie5: oklchToHex(P.cScale[7]),
    pie6: oklchToHex(P.cScale[9]),
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
