import { app, BrowserWindow, Menu, ipcMain, safeStorage, nativeImage, nativeTheme, session, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getDataDir } from '../lib/data-dir.js'
import { startServer } from '../server/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const esmRequire = createRequire(import.meta.url)

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

app.name = 'Tutor'

const menuTemplate: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'Tutor',
    submenu: [
      { role: 'about', label: 'About Tutor' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: 'Hide Tutor' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: 'Quit Tutor' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
  {
    label: 'View',
    submenu: [
      ...(app.isPackaged ? [] : [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
      ]),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'close' },
    ],
  },
]

function getAppIcon() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(process.env.APP_ROOT!, 'assets', 'icon.png')
  return nativeImage.createFromPath(iconPath)
}

function createWindow() {
  const isDark = nativeTheme.shouldUseDarkColors
  const win = new BrowserWindow({
    show: false,
    backgroundColor: isDark ? '#1c1d2e' : '#fafafc',
    width: 1280,
    height: 900,
    minWidth: 320,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- Redux-persist file storage IPC ---

const dataDir = getDataDir()
const stateFile = path.join(dataDir, 'redux-state.json')

async function ensureDataDir() {
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 })
  }
}

ipcMain.handle('storage:get', async (_event, key: string) => {
  await ensureDataDir()
  if (!existsSync(stateFile)) return null
  try {
    const data = JSON.parse(await readFile(stateFile, 'utf-8'))
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
    const value = data[key] ?? null
    if (value !== null && typeof value !== 'string') return null
    return value
  } catch {
    return null
  }
})

ipcMain.handle('storage:set', async (_event, key: string, value: string) => {
  await ensureDataDir()
  let data: Record<string, string> = {}
  if (existsSync(stateFile)) {
    try {
      data = JSON.parse(await readFile(stateFile, 'utf-8'))
    } catch { /* start fresh */ }
  }
  data[key] = value
  await writeFile(stateFile, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('storage:remove', async (_event, key: string) => {
  await ensureDataDir()
  if (!existsSync(stateFile)) return
  try {
    const data = JSON.parse(await readFile(stateFile, 'utf-8'))
    delete data[key]
    await writeFile(stateFile, JSON.stringify(data, null, 2), 'utf-8')
  } catch { /* ignore */ }
})

// --- API Key secure storage (safeStorage) ---

const VALID_PROVIDERS = ['anthropic', 'openai', 'google']

function apiKeyFile(provider?: string): string {
  if (provider && !VALID_PROVIDERS.includes(provider)) {
    throw new Error('Invalid provider')
  }
  const suffix = provider ? `-${provider}` : ''
  return path.join(dataDir, `api-key${suffix}.enc`)
}

ipcMain.handle('apiKey:save', async (_event, key: string, provider?: string) => {
  await ensureDataDir()
  const encrypted = safeStorage.encryptString(key)
  await writeFile(apiKeyFile(provider), encrypted)
})

ipcMain.handle('apiKey:load', async (_event, provider?: string) => {
  const file = apiKeyFile(provider)
  if (!existsSync(file)) return null
  try {
    const encrypted = await readFile(file)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
})

ipcMain.handle('apiKey:remove', async (_event, provider?: string) => {
  const file = apiKeyFile(provider)
  if (existsSync(file)) {
    await rm(file)
  }
})

let apiPort = 0

app.whenReady().then(async () => {
  // Start the embedded API server on a random free port (localhost only — no firewall prompt)
  const server = await startServer(0, '127.0.0.1')
  const addr = server.server.address()
  apiPort = typeof addr === 'object' && addr ? addr.port : 0

  ipcMain.handle('get-api-port', () => apiPort)

  ipcMain.handle('file:save', async (_event, defaultName: string, base64Data: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'EPUB', extensions: ['epub'] }],
    })
    if (canceled || !filePath) return false
    await writeFile(filePath, Buffer.from(base64Data, 'base64'))
    return true
  })

  // Override mermaid renderer with Electron BrowserWindow-based renderer
  // (faster and works offline, unlike the kroki.io API fallback).
  // Renders to PNG <img> tags — SVGs render poorly in most e-readers.
  const { sanitizeMermaidChart } = await import('../src/lib/sanitize-mermaid.js')
  const { mermaidInitConfig } = await import('../lib/mermaid-theme.js')

  ;(server as unknown as { mermaidRenderer: unknown }).mermaidRenderer = async (charts: string[]) => {
    if (charts.length === 0) return []

    const win = new BrowserWindow({
      show: false,
      width: 1600,
      height: 1200,
      webPreferences: { offscreen: true },
    })

    try {
      const mermaidPath = esmRequire.resolve('mermaid/dist/mermaid.min.js')
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
          // Render mermaid SVG, insert into DOM, then capture page as PNG
          const dimensions: { width: number; height: number } = await Promise.race([
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
              setTimeout(() => reject(new Error('Mermaid render timeout')), 10_000)
            ),
          ])

          // Resize to fit diagram and capture as PNG
          win.setContentSize(Math.max(dimensions.width, 200), Math.max(dimensions.height, 100))
          await new Promise(r => setTimeout(r, 100))
          const image = await win.webContents.capturePage()
          const pngBuffer = image.toPNG()
          // Save to temp file — epub-gen-memory doesn't support data: URLs
          const tmpPng = path.join(dataDir, `mermaid-chart-${i}.png`)
          await writeFile(tmpPng, pngBuffer)
          const { pathToFileURL } = await import('node:url')
          results.push(`<img src="${pathToFileURL(tmpPng).href}" alt="diagram" style="max-width:100%"/>`)
        } catch (err) {
          console.warn('[mermaid-renderer] Chart ' + i + ' failed:', err)
          results.push('<pre><code class="language-mermaid">' + sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>')
        }
      }

      await rm(tmpHtml).catch(() => {})
      return results
    } finally {
      win.destroy()
    }
  }

  // POST all saved API keys to the server's key store
  for (const provider of VALID_PROVIDERS) {
    const file = apiKeyFile(provider)
    if (existsSync(file)) {
      try {
        const encrypted = await readFile(file)
        const key = safeStorage.decryptString(encrypted)
        await fetch(`http://127.0.0.1:${apiPort}/api/settings/api-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey: key }),
        })
      } catch { /* ignore */ }
    }
  }
  // Also try loading legacy keyFile (no provider suffix) as anthropic
  const legacyFile = apiKeyFile()
  if (existsSync(legacyFile)) {
    try {
      const encrypted = await readFile(legacyFile)
      const key = safeStorage.decryptString(encrypted)
      await fetch(`http://127.0.0.1:${apiPort}/api/settings/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic', apiKey: key }),
      })
    } catch { /* ignore */ }
  }

  // CSP enforcement
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'${VITE_DEV_SERVER_URL ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; ` +
          `connect-src 'self' http://127.0.0.1:* http://localhost:*${VITE_DEV_SERVER_URL ? ' ws://localhost:*' : ''}; img-src 'self' data: http://127.0.0.1:* http://localhost:*; font-src 'self';`,
        ],
      },
    })
  })

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getAppIcon())
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})
