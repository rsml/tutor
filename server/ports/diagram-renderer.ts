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
 * An empty string result for a chart means that chart failed to render.
 * Both real implementations already treat a single chart's failure as keep
 * going rather than fail the whole batch. The kroki.io implementation
 * already pushes an empty string on failure, matching this contract
 * exactly. The Electron implementation currently pushes an escaped
 * pre code fallback block showing the raw chart source instead of an
 * empty string. That is real behaviour today, but it does not match this
 * port's contract, so reconciling it, most likely by having the future
 * Electron adapter return an empty string the same way the kroki adapter
 * does, is a decision for whoever builds that adapter, not something this
 * task changes in electron/main.ts.
 *
 * render takes no AbortSignal. Neither real implementation accepts a
 * caller supplied one today. The kroki.io call uses a fixed internal
 * AbortSignal.timeout, and the Electron renderer uses a fixed internal per
 * chart timeout, so there is nothing for the port to expose yet.
 */

export interface DiagramRenderer {
  /**
   * Renders each chart and returns one markup string per chart, in the
   * same order as charts. A chart that fails to render yields an empty
   * string at that index rather than rejecting the whole call. An empty
   * charts array resolves to an empty array without doing any rendering
   * work.
   */
  render(charts: string[]): Promise<string[]>
}
