/**
 * Renders mermaid diagram source into embeddable markup for EPUB export.
 * Today this happens two different ways behind the same
 * fastify.mermaidRenderer decoration. server/index.ts sets a default that
 * calls the kroki.io HTTP API and writes each returned PNG to a temp file.
 * electron/main.ts overrides that decoration at startup, when running
 * inside Electron, with an offscreen BrowserWindow that renders with the
 * real mermaid.js and captures a PNG from the page. Neither file is
 * touched by this port, it is written from reading both so that a future
 * kroki adapter and a future Electron adapter can both satisfy it as is.
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
