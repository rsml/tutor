import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diagramSourceFallback } from '../ports/diagram-renderer.js'
import { createElectronDiagramRenderer, type MermaidBrowserWindow } from './electron-diagram-renderer.js'

/**
 * These tests never create a real Electron window. BrowserWindow is a
 * fully scripted fake: its executeJavaScript never runs real mermaid.js,
 * it just returns or rejects however each test configures it for that
 * chart's index (parsed out of the 'epub-chart-N' id in the injected
 * script string). dataDir is a real temp directory, since writing the
 * scratch HTML page and PNG captures there is plain local disk I/O with
 * no external dependency.
 *
 * Chart fixtures deliberately avoid brackets/parens/braces and style/class
 * directives, so sanitizeMermaidChart leaves them byte-for-byte unchanged
 * and the fallback assertions can compare directly against the original
 * chart text.
 */

type ExecuteBehavior = (chartIndex: number, code: string) => Promise<{ width: number; height: number }>

function createFakeBrowserWindowClass(onExecuteJavaScript: ExecuteBehavior) {
  class FakeBrowserWindow implements MermaidBrowserWindow {
    static instances: FakeBrowserWindow[] = []
    static captureCount = 0
    destroyed = false
    loadedFile: string | null = null
    loadedHtml: string | null = null
    sizes: Array<{ width: number; height: number }> = []
    lastChartIndex = -1

    webContents = {
      executeJavaScript: async (code: string): Promise<unknown> => {
        const match = code.match(/epub-chart-(\d+)/)
        this.lastChartIndex = match ? Number(match[1]) : -1
        return onExecuteJavaScript(this.lastChartIndex, code)
      },
      capturePage: async () => {
        const index = this.lastChartIndex
        return { toPNG: () => Buffer.from(`fake-png-for-chart-${index}`) }
      },
    }

    constructor(public options: unknown) {
      FakeBrowserWindow.instances.push(this)
    }

    async loadFile(filePath: string) {
      this.loadedFile = filePath
      this.loadedHtml = await readFile(filePath, 'utf-8')
    }

    setContentSize(width: number, height: number) {
      this.sizes.push({ width, height })
    }

    destroy() {
      this.destroyed = true
    }
  }
  return FakeBrowserWindow
}

describe('createElectronDiagramRenderer (whitebox)', () => {
  const tmpDirs: string[] = []

  async function makeDataDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'electron-diagram-renderer-test-'))
    tmpDirs.push(dir)
    return dir
  }

  async function makeMermaidPath(dataDir: string): Promise<string> {
    const mermaidPath = join(dataDir, 'fake-mermaid.min.js')
    await writeFile(mermaidPath, '/* fake mermaid bundle, never actually executed in these tests */')
    return mermaidPath
  }

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('renders every chart in order, writing one PNG per chart and returning matching <img> markup', async () => {
    const dataDir = await makeDataDir()
    const mermaidPath = await makeMermaidPath(dataDir)
    const FakeBrowserWindow = createFakeBrowserWindowClass(async (index) => ({ width: 100 + index, height: 50 }))

    const renderer = createElectronDiagramRenderer({
      BrowserWindow: FakeBrowserWindow,
      dataDir,
      resolveMermaidPath: () => mermaidPath,
    })

    const results = await renderer.render(['graph TD; A-->B', 'graph TD; C-->D'])

    expect(results).toHaveLength(2)
    for (let i = 0; i < results.length; i++) {
      expect(results[i]).toContain('<img src="file://')
      expect(results[i]).toContain(`mermaid-chart-${i}.png`)
      const pngPath = join(dataDir, `mermaid-chart-${i}.png`)
      expect((await readFile(pngPath)).toString('utf-8')).toBe(`fake-png-for-chart-${i}`)
    }

    const [win] = FakeBrowserWindow.instances
    expect(win.destroyed).toBe(true)
    expect(win.loadedHtml).toContain('fake mermaid bundle')
    expect(win.loadedHtml).toContain('"theme":"default"')

    // The scratch renderer HTML page is cleaned up once rendering finishes.
    await expect(access(join(dataDir, 'mermaid-renderer.html'))).rejects.toThrow()
  })

  it('falls back to the escaped source block when a chart rejects, without failing the batch', async () => {
    const dataDir = await makeDataDir()
    const mermaidPath = await makeMermaidPath(dataDir)
    const FakeBrowserWindow = createFakeBrowserWindowClass(async (index) => {
      if (index === 1) throw new Error('mermaid.render blew up')
      return { width: 100, height: 50 }
    })

    const renderer = createElectronDiagramRenderer({
      BrowserWindow: FakeBrowserWindow,
      dataDir,
      resolveMermaidPath: () => mermaidPath,
    })

    const charts = ['graph TD; A-->B', 'graph TD; C-->D', 'graph TD; E-->F']
    const results = await renderer.render(charts)

    expect(results).toHaveLength(3)
    expect(results[0]).not.toBe(diagramSourceFallback(charts[0]))
    expect(results[1]).toBe(diagramSourceFallback(charts[1]))
    expect(results[2]).not.toBe(diagramSourceFallback(charts[2]))
    for (const result of results) expect(result).not.toBe('')

    expect(FakeBrowserWindow.instances[0].destroyed).toBe(true)
  })

  it('falls back to the escaped source block when a chart times out', async () => {
    const dataDir = await makeDataDir()
    const mermaidPath = await makeMermaidPath(dataDir)
    const FakeBrowserWindow = createFakeBrowserWindowClass(async (index) => {
      if (index === 0) return new Promise(() => { /* never resolves — simulates a hang */ })
      return { width: 100, height: 50 }
    })

    const renderer = createElectronDiagramRenderer({
      BrowserWindow: FakeBrowserWindow,
      dataDir,
      resolveMermaidPath: () => mermaidPath,
      perChartTimeoutMs: 20,
    })

    const charts = ['graph TD; A-->B', 'graph TD; C-->D']
    const results = await renderer.render(charts)

    expect(results[0]).toBe(diagramSourceFallback(charts[0]))
    expect(results[1]).not.toBe(diagramSourceFallback(charts[1]))
  })

  it('returns an empty array for an empty input without creating a BrowserWindow', async () => {
    const dataDir = await makeDataDir()
    const mermaidPath = await makeMermaidPath(dataDir)
    const FakeBrowserWindow = createFakeBrowserWindowClass(async () => ({ width: 100, height: 50 }))

    const renderer = createElectronDiagramRenderer({
      BrowserWindow: FakeBrowserWindow,
      dataDir,
      resolveMermaidPath: () => mermaidPath,
    })

    const results = await renderer.render([])

    expect(results).toEqual([])
    expect(FakeBrowserWindow.instances).toHaveLength(0)
  })

  it('still destroys the window when rendering fails before the per-chart loop', async () => {
    const dataDir = await makeDataDir()
    const FakeBrowserWindow = createFakeBrowserWindowClass(async () => ({ width: 100, height: 50 }))

    const renderer = createElectronDiagramRenderer({
      BrowserWindow: FakeBrowserWindow,
      dataDir,
      resolveMermaidPath: () => join(dataDir, 'does-not-exist.js'),
    })

    await expect(renderer.render(['graph TD; A-->B'])).rejects.toThrow()
    expect(FakeBrowserWindow.instances[0].destroyed).toBe(true)
  })
})
