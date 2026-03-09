import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'
import { formatHex, parse } from 'culori'

function oklchToHex(color: string): string {
  return formatHex(parse(color))!
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

// Convert entire palette to hex for mermaid compatibility
const H = {
  ...Object.fromEntries(
    Object.entries(P).filter(([k]) => k !== 'cScale').map(([k, v]) => [k, oklchToHex(v as string)])
  ),
  cScale: P.cScale.map(oklchToHex),
} as { [K in keyof typeof P]: K extends 'cScale' ? string[] : string }

const themeCSS = `
/* Node shapes */
.node rect, .node polygon, .node circle, .node ellipse,
.node .label-container {
  stroke: ${H.nodeBorder} !important;
}
.nodeLabel, .node .label {
  fill: ${H.nodeText} !important;
  color: ${H.nodeText} !important;
}

/* Edge labels — high contrast */
.edgeLabel {
  background-color: ${H.edgeLabelBg} !important;
  color: ${H.edgeLabelText} !important;
}
.edgeLabel rect {
  fill: ${H.edgeLabelBg} !important;
  opacity: 1 !important;
}
.edgeLabel span, .edgeLabel p {
  color: ${H.edgeLabelText} !important;
}

/* Edge paths */
.edgePath path {
  stroke: ${H.edgeLine} !important;
}
.arrowheadPath, marker path {
  fill: ${H.edgeLine} !important;
  stroke: ${H.edgeLine} !important;
}

/* Clusters / subgraphs */
.cluster rect {
  fill: ${H.clusterBg} !important;
  stroke: ${H.clusterBorder} !important;
}
.cluster span, .cluster .nodeLabel {
  color: ${H.noteText} !important;
  fill: ${H.noteText} !important;
}

/* Sequence diagram */
.actor {
  fill: ${H.primary} !important;
  stroke: ${H.nodeBorder} !important;
}
text.actor > tspan {
  fill: ${H.nodeText} !important;
}
.activation0, .activation1, .activation2 {
  fill: ${H.tertiary} !important;
  stroke: ${H.nodeBorder} !important;
}
line[class^="messageLine"], .messageLine0, .messageLine1 {
  stroke: ${H.edgeLine} !important;
}
.messageText {
  fill: ${H.edgeLabelText} !important;
}
.labelText, .loopText tspan {
  fill: ${H.noteText} !important;
}
.loopLine {
  stroke: ${H.clusterBorder} !important;
}
.note {
  fill: ${H.noteBg} !important;
  stroke: ${H.clusterBorder} !important;
}
.noteText {
  fill: ${H.noteText} !important;
}
`

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeCSS,
  themeVariables: {
    // Base
    background: 'transparent',
    mainBkg: H.primary,
    fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro, system-ui, sans-serif',
    fontSize: '14px',

    // Primary palette (nodes, arrows)
    primaryColor: H.primary,
    primaryTextColor: H.nodeText,
    primaryBorderColor: H.nodeBorder,
    secondaryColor: H.secondary,
    secondaryTextColor: H.nodeText,
    secondaryBorderColor: H.nodeBorder,
    tertiaryColor: H.tertiary,
    tertiaryTextColor: H.nodeText,
    tertiaryBorderColor: H.nodeBorder,

    // Lines & edges
    lineColor: H.edgeLine,
    edgeLabelBackground: H.edgeLabelBg,
    labelTextColor: H.edgeLabelText,

    // Node defaults (flowchart)
    nodeBorder: H.nodeBorder,
    nodeTextColor: H.nodeText,

    // Cluster / subgraph
    clusterBkg: H.clusterBg,
    clusterBorder: H.clusterBorder,

    // Color scale overrides (prevents pastel defaults)
    ...Object.fromEntries(H.cScale.flatMap((c, i) => [
      [`cScale${i}`, c],
      [`cScalePeer${i}`, H.nodeText],
      [`cScaleLabel${i}`, H.nodeText],
    ])),

    // Note styling
    noteBkgColor: H.noteBg,
    noteTextColor: H.noteText,
    noteBorderColor: H.clusterBorder,

    // Sequence diagram specific
    actorBkg: H.primary,
    actorTextColor: H.nodeText,
    actorBorder: H.nodeBorder,
    activationBorderColor: H.nodeBorder,
    activationBkgColor: H.tertiary,
    signalColor: H.edgeLabelText,

    // State diagram
    labelColor: H.edgeLabelText,

    // Pie chart — use cScale hues for variety
    pie1: H.cScale[0],
    pie2: H.cScale[1],
    pie3: H.cScale[4],
    pie4: H.cScale[5],
    pie5: H.cScale[7],
    pie6: H.cScale[9],
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
