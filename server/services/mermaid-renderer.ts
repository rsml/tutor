type MermaidRendererFn = (charts: string[]) => Promise<string[]>

let renderer: MermaidRendererFn | null = null
let warnedOnce = false

export function setMermaidRenderer(fn: MermaidRendererFn): void {
  renderer = fn
}

export function resetMermaidRenderer(): void {
  renderer = null
  warnedOnce = false
}

export async function renderMermaidCharts(charts: string[]): Promise<string[]> {
  if (charts.length === 0) return []
  if (!renderer) {
    if (!warnedOnce) {
      console.warn('[mermaid-renderer] No renderer registered — mermaid diagrams will not be rendered in EPUB export')
      warnedOnce = true
    }
    return []
  }
  try {
    return await renderer(charts)
  } catch (err) {
    console.error('[mermaid-renderer] Batch render failed:', err)
    return []
  }
}
