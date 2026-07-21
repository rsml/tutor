import path from 'node:path'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { sanitizeMermaidChart } from '@shared/sanitize-mermaid.js'
import { mermaidInitConfig } from '@shared/mermaid-theme.js'
import { diagramSourceFallback, type DiagramRenderer } from '../ports/diagram-renderer.js'

/** How long a single chart gets to render before its slot falls back to the escaped source block. */
const DEFAULT_PER_CHART_TIMEOUT_MS = 10_000

/**
 * The minimal surface this adapter needs from an Electron BrowserWindow
 * instance. Electron's real BrowserWindow satisfies this structurally, so
 * no cast is needed at the call site in electron/main.ts, but this module
 * never imports 'electron' itself, so it stays importable (and testable)
 * from plain Node.
 */
export interface MermaidBrowserWindow {
  loadFile(filePath: string): Promise<void>
  webContents: {
    /** Return type is genuinely dynamic — whatever the injected page script hands back. */
    executeJavaScript(code: string): Promise<unknown>
    capturePage(): Promise<{ toPNG(): Buffer }>
  }
  setContentSize(width: number, height: number): void
  destroy(): void
}

/**
 * Constructor deps for createElectronDiagramRenderer. All four are
 * required. There is no sensible default for an offscreen BrowserWindow
 * constructor or a mermaid bundle path to fall back to.
 */
export interface ElectronDiagramRendererDeps {
  /** Electron's BrowserWindow constructor, injected so this module never imports 'electron' directly. */
  BrowserWindow: new (options: {
    show: boolean
    width: number
    height: number
    webPreferences: { offscreen: boolean }
  }) => MermaidBrowserWindow
  /** Directory for the scratch renderer HTML page and per-chart PNG captures. */
  dataDir: string
  /** Resolves the on-disk path to mermaid's bundled UMD build. */
  resolveMermaidPath: () => string
  /** Per-chart render timeout, in ms. Defaults to 10 seconds, matching the original inline renderer. Overridable in tests. */
  perChartTimeoutMs?: number
}

/**
 * Factory for the DiagramRenderer port, backed by an offscreen Electron
 * BrowserWindow running the real mermaid.js. electron/main.ts passes an
 * instance of this as a `diagramRenderer` override into startServer at
 * startup, in place of the kroki.io default, because it is faster and works
 * offline.
 */
export function createElectronDiagramRenderer(deps: ElectronDiagramRendererDeps): DiagramRenderer {
  const { BrowserWindow, dataDir, resolveMermaidPath } = deps
  const perChartTimeoutMs = deps.perChartTimeoutMs ?? DEFAULT_PER_CHART_TIMEOUT_MS

  return {
    async render(charts: string[]): Promise<string[]> {
      if (charts.length === 0) return []

      const win = new BrowserWindow({
        show: false,
        width: 1600,
        height: 1200,
        webPreferences: { offscreen: true },
      })

      try {
        const mermaidPath = resolveMermaidPath()
        const mermaidJs = await readFile(mermaidPath, 'utf-8')

        const tmpHtml = path.join(dataDir, 'mermaid-renderer.html')
        // Safe: mermaidJs is from a trusted local npm package, not user input
        await writeFile(tmpHtml, `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body { margin: 0; background: white; }</style>
</head><body>
<div id="output"></div>
<script>${mermaidJs}<` + `/script>
<script>
  mermaid.initialize(${JSON.stringify({ ...mermaidInitConfig, theme: 'default' })});
<` + `/script>
</body></html>`, 'utf-8')

        await win.loadFile(tmpHtml)

        const results: string[] = []
        for (let i = 0; i < charts.length; i++) {
          const sanitized = sanitizeMermaidChart(charts[i])
          try {
            const dimensions = await Promise.race([
              win.webContents.executeJavaScript(`
                (async () => {
                  const { svg } = await mermaid.render('epub-chart-${i}', ${JSON.stringify(sanitized)});
                  const output = document.getElementById('output');
                  output.replaceChildren();
                  output.insertAdjacentHTML('afterbegin', svg);
                  const svgEl = output.querySelector('svg');
                  const rect = svgEl.getBoundingClientRect();
                  return { width: Math.ceil(rect.width) + 20, height: Math.ceil(rect.height) + 20 };
                })()
              `),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Mermaid render timeout')), perChartTimeoutMs)
              ),
            ]) as { width: number; height: number }

            // Resize to fit diagram and capture as PNG
            win.setContentSize(Math.max(dimensions.width, 200), Math.max(dimensions.height, 100))
            await new Promise(r => setTimeout(r, 100))
            const image = await win.webContents.capturePage()
            const pngBuffer = image.toPNG()
            // Save to temp file — epub-gen-memory doesn't support data: URLs
            const tmpPng = path.join(dataDir, `mermaid-chart-${i}.png`)
            await writeFile(tmpPng, pngBuffer)
            results.push(`<img src="${pathToFileURL(tmpPng).href}" alt="diagram" style="max-width:100%"/>`)
          } catch (err) {
            console.warn('[mermaid-renderer] Chart ' + i + ' failed:', err)
            results.push(diagramSourceFallback(sanitized))
          }
        }

        await rm(tmpHtml).catch(() => {})
        return results
      } finally {
        win.destroy()
      }
    },
  }
}
