import { diagramSourceFallback, type DiagramRenderer } from './diagram-renderer.js'

/**
 * Deterministic in-memory DiagramRenderer. A chart whose source is empty
 * or whitespace only fails to render, standing in for the malformed
 * diagram source a real renderer would reject, and yields the same
 * escaped source fallback every real implementation owes. Every other
 * chart succeeds with a synthetic, clearly fake markup string that echoes
 * the chart's index, so ordering is easy to assert on without depending on
 * real kroki.io or Electron markup shapes.
 */

export interface FakeDiagramRenderer extends DiagramRenderer {
  /** Every charts array passed to render, most recent last, for tests that assert on adapter usage instead of just on results. */
  readonly calls: string[][]
}

export function createFakeDiagramRenderer(): FakeDiagramRenderer {
  const calls: string[][] = []

  return {
    calls,

    async render(charts: string[]) {
      calls.push(charts)
      if (charts.length === 0) return []
      return charts.map((chart, i) =>
        chart.trim().length === 0
          ? diagramSourceFallback(chart)
          : `<svg data-fake-diagram-index="${i}"></svg>`,
      )
    },
  }
}
