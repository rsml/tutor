import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DIAGRAM_RENDER_TIMEOUT_MS } from '../constants.js'
import { diagramSourceFallback, type DiagramRenderer } from '../ports/diagram-renderer.js'

/**
 * Renders mermaid charts via the kroki.io HTTP API, writing each returned
 * PNG to a temp file (epub-gen-memory doesn't support data: URLs). This is
 * the default DiagramRenderer adapter, used by standalone and dev server
 * mode; Electron overrides it at startup with an offscreen BrowserWindow
 * renderer instead (see electron-diagram-renderer.ts).
 *
 * Behavior change from the original inline version: a chart that fails to
 * render (a non-ok response, or a thrown error such as a timeout) now
 * yields diagramSourceFallback(chart) instead of ''. This is the
 * DiagramRenderer port's contract and matches what the Electron renderer
 * has always done; previously this path was the one place a failed chart
 * produced an empty string.
 */
export interface KrokiDiagramRendererDeps {
  /** Overridable for tests; defaults to the global fetch. */
  fetch?: typeof fetch
  /** Per-chart request timeout, in ms. Defaults to DIAGRAM_RENDER_TIMEOUT_MS. */
  timeoutMs?: number
}

export function createKrokiDiagramRenderer(deps: KrokiDiagramRendererDeps = {}): DiagramRenderer {
  const fetchImpl = deps.fetch ?? fetch
  const timeoutMs = deps.timeoutMs ?? DIAGRAM_RENDER_TIMEOUT_MS

  return {
    async render(charts: string[]): Promise<string[]> {
      if (charts.length === 0) return []

      const results: string[] = []
      for (const chart of charts) {
        try {
          const res = await fetchImpl('https://kroki.io/mermaid/png', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: chart,
            signal: AbortSignal.timeout(timeoutMs),
          })
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            const tmpFile = join(tmpdir(), `tutor-mermaid-${randomUUID()}.png`)
            await writeFile(tmpFile, buf)
            results.push(`<img src="${pathToFileURL(tmpFile).href}" alt="diagram" style="max-width:100%"/>`)
          } else {
            console.warn(`[mermaid-renderer] kroki.io returned ${res.status}: ${await res.text().catch(() => '')}`)
            results.push(diagramSourceFallback(chart))
          }
        } catch (err) {
          console.warn('[mermaid-renderer] kroki.io fallback failed:', err)
          results.push(diagramSourceFallback(chart))
        }
      }
      return results
    },
  }
}
