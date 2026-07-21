/**
 * Renders mermaid diagram source into embeddable markup for EPUB export.
 * Today this happens two different ways behind this one port. The default
 * adapter calls the kroki.io HTTP API and writes each returned PNG to a temp
 * file (server/adapters/kroki-diagram-renderer.ts). electron/main.ts passes
 * a `diagramRenderer` override into startServer at startup, when running
 * inside Electron, backed by an offscreen BrowserWindow that renders with
 * the real mermaid.js and captures a PNG from the page
 * (server/adapters/electron-diagram-renderer.ts). Neither file is touched by
 * this port, it is written from reading both so that a future kroki adapter
 * and a future Electron adapter can both satisfy it as is.
 *
 * A chart that fails to render yields readable fallback markup rather than
 * an empty string. Both real implementations already treat a single
 * chart's failure as keep going rather than fail the whole batch, and the
 * Electron renderer already emits an escaped code block holding the chart
 * source so the reader sees the diagram's text instead of a hole in the
 * page. That is the better of the two behaviours, so it is the contract,
 * and the kroki adapter adopts it. Use diagramSourceFallback below to
 * produce it, so no implementation can drift from the markup the others
 * emit.
 *
 * render takes no AbortSignal. Neither real implementation accepts a
 * caller supplied one today. The kroki.io call uses a fixed internal
 * AbortSignal.timeout, and the Electron renderer uses a fixed internal per
 * chart timeout, so there is nothing for the port to expose yet.
 *
 * The in-memory fake is diagram-renderer.fake.ts's createFakeDiagramRenderer,
 * and the shared behavioural spec every implementation must satisfy is
 * diagram-renderer.contract.ts's describeDiagramRendererContract, fake
 * only, per that file's own header.
 */

/**
 * The markup every implementation must emit for a chart it could not
 * render. An escaped mermaid code block, so the reader still gets the
 * diagram's source rather than a blank space, and so nothing in the chart
 * source can inject markup into the EPUB. Lifted verbatim from the
 * fallback the Electron renderer has always used.
 */
export function diagramSourceFallback(chartSource: string): string {
  const escaped = chartSource.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<pre><code class="language-mermaid">${escaped}</code></pre>`
}

/**
 * The one method this port exposes. Kept as a named interface, like every
 * other port here, so server/composition-root.ts and Electron's own
 * startup override can each hand in a different real implementation, or a
 * test can hand in createFakeDiagramRenderer(), behind the identical shape.
 */
export interface DiagramRenderer {
  /**
   * Renders each chart and returns one markup string per chart, in the
   * same order as charts. A chart that fails to render yields
   * diagramSourceFallback of that chart's source at that index rather than
   * rejecting the whole call, so the result is never an empty string. An
   * empty charts array resolves to an empty array without doing any
   * rendering work.
   */
  render(charts: string[]): Promise<string[]>
}
