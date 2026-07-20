import { app, BrowserWindow, Menu, ipcMain, safeStorage, nativeImage, nativeTheme, session, dialog, shell } from 'electron'
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

// Renderer pushes this on every running-task change. We intercept close
// to prompt the user when work is in flight (audiobook gen, EPUB export,
// model install, etc.) so they don't accidentally abandon a long-running
// task and end up with stale/partial artifacts.
let busyTaskCount = 0
let busyTaskLabels: string[] = []
const dismissedConfirm = new WeakSet<BrowserWindow>()

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

  win.on('close', (event) => {
    if (busyTaskCount === 0 || dismissedConfirm.has(win)) return
    event.preventDefault()
    const detail = busyTaskLabels.length > 0
      ? busyTaskLabels.slice(0, 4).map((l) => `• ${l}`).join('\n') +
        (busyTaskLabels.length > 4 ? `\n• and ${busyTaskLabels.length - 4} more...` : '')
      : `${busyTaskCount} background task${busyTaskCount > 1 ? 's' : ''} still running.`
    const { response } = dialog.showMessageBoxSync
      ? { response: dialog.showMessageBoxSync(win, {
          type: 'warning',
          buttons: ['Cancel', 'Quit anyway'],
          defaultId: 0,
          cancelId: 0,
          title: 'Tasks still running',
          message: 'Quit Tutor?',
          detail,
        }) }
      : { response: 0 }
    if (response === 1) {
      dismissedConfirm.add(win)
      win.close()
    }
  })

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

// safeStorage's encryption key is bound to the Electron binary's signing identity,
// which differs between packaged builds and unpackaged runs (dev/preview). Two
// modes sharing one .enc file means each launch can't decrypt what the other
// wrote — keys appear "reset" until re-entered, which then breaks the other
// mode. Suffixing the filename by identity gives each mode its own slot so
// neither clobbers the other.
const SAFESTORAGE_IDENTITY = app.isPackaged ? 'packaged' : 'dev'

function apiKeyFile(provider?: string): string {
  if (provider && !VALID_PROVIDERS.includes(provider)) {
    throw new Error('Invalid provider')
  }
  const suffix = provider ? `-${provider}` : ''
  return path.join(dataDir, `api-key${suffix}.${SAFESTORAGE_IDENTITY}.enc`)
}

function legacyApiKeyFile(provider?: string): string {
  if (provider && !VALID_PROVIDERS.includes(provider)) {
    throw new Error('Invalid provider')
  }
  const suffix = provider ? `-${provider}` : ''
  return path.join(dataDir, `api-key${suffix}.enc`)
}

async function loadApiKey(provider?: string): Promise<string | null> {
  const file = apiKeyFile(provider)
  const legacy = legacyApiKeyFile(provider)
  if (existsSync(file)) {
    try {
      const encrypted = await readFile(file)
      return safeStorage.decryptString(encrypted)
    } catch (err) {
      console.warn(`[apiKey] load(${provider ?? 'legacy'}) — decrypt of ${file} failed (identity=${SAFESTORAGE_IDENTITY}): ${(err as Error).message}. File preserved.`)
      return null
    }
  }
  // Fall back to legacy unsuffixed file written before the identity split.
  // If decrypt succeeds with current identity, copy it forward and keep the
  // legacy file in place so the *other* mode can still claim it later.
  if (existsSync(legacy)) {
    try {
      const encrypted = await readFile(legacy)
      const plaintext = safeStorage.decryptString(encrypted)
      try {
        await ensureDataDir()
        const reEncrypted = safeStorage.encryptString(plaintext)
        await writeFile(file, reEncrypted)
        console.log(`[apiKey] load(${provider ?? 'legacy'}) — migrated legacy key into ${file}`)
      } catch (err) {
        console.warn(`[apiKey] load(${provider ?? 'legacy'}) — legacy decrypt OK but migration write failed: ${(err as Error).message}`)
      }
      return plaintext
    } catch (err) {
      console.warn(`[apiKey] load(${provider ?? 'legacy'}) — legacy file at ${legacy} unreadable by identity=${SAFESTORAGE_IDENTITY}: ${(err as Error).message}. File preserved.`)
      return null
    }
  }
  return null
}

ipcMain.handle('apiKey:save', async (_event, key: string, provider?: string) => {
  await ensureDataDir()
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(`[apiKey] save(${provider ?? 'legacy'}) — safeStorage unavailable, refusing to write`)
    throw new Error('Secure storage unavailable on this system')
  }
  const encrypted = safeStorage.encryptString(key)
  await writeFile(apiKeyFile(provider), encrypted)
  console.log(`[apiKey] save(${provider ?? 'legacy'}) — wrote ${apiKeyFile(provider)}`)
})

ipcMain.handle('apiKey:load', async (_event, provider?: string) => loadApiKey(provider))

ipcMain.handle('apiKey:remove', async (_event, provider?: string) => {
  // Only delete the current-identity file. The legacy unsuffixed file may
  // belong to the other mode (or be unreadable by us) — leave it alone so
  // the other mode's data isn't collaterally trashed.
  const file = apiKeyFile(provider)
  if (existsSync(file)) {
    await rm(file)
    console.log(`[apiKey] remove(${provider ?? 'legacy'}) — deleted ${file}`)
  } else {
    console.log(`[apiKey] remove(${provider ?? 'legacy'}) — no file at ${file}, nothing to delete`)
  }
})

// One-time migration: encrypt any plaintext keys from server-side api-keys.json
// into per-provider .enc files via safeStorage. Only runs in the packaged app
// (dev/preview use a different safeStorage identity, so encrypting there would
// produce .enc files the production app can't decrypt). Verifies each
// encrypted file decrypts back to the original before considering the key
// migrated, and only deletes the plaintext file once every key migrated cleanly.
async function migrateLegacyPlaintextKeys() {
  if (!app.isPackaged) return
  const plaintextFile = path.join(dataDir, 'api-keys.json')
  if (!existsSync(plaintextFile)) return
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    const raw = await readFile(plaintextFile, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return
    await ensureDataDir()
    let allMigrated = true
    for (const provider of VALID_PROVIDERS) {
      const key = parsed[provider]
      if (typeof key !== 'string' || key.length === 0) continue
      const target = apiKeyFile(provider)
      if (existsSync(target)) continue // already encrypted — don't overwrite
      const encrypted = safeStorage.encryptString(key)
      await writeFile(target, encrypted)
      // Verify roundtrip before treating this key as safely migrated
      try {
        const verify = await readFile(target)
        if (safeStorage.decryptString(verify) !== key) throw new Error('verify mismatch')
      } catch {
        await rm(target).catch(() => {})
        allMigrated = false
      }
    }
    if (allMigrated) await rm(plaintextFile)
  } catch {
    // Migration failed — leave the plaintext file alone so we can retry next launch
  }
}

let apiPort = 0

app.whenReady().then(async () => {
  await migrateLegacyPlaintextKeys()
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

  ipcMain.handle('shell:show-item', async (_event, filePath: string) => {
    if (!existsSync(filePath)) return false
    shell.showItemInFolder(filePath)
    return true
  })

  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    if (!existsSync(filePath)) return false
    const err = await shell.openPath(filePath)
    return err === ''
  })

  ipcMain.handle('app:set-busy-state', async (_event, count: number, labels: string[]) => {
    busyTaskCount = Math.max(0, Number(count) || 0)
    busyTaskLabels = Array.isArray(labels) ? labels.slice(0, 8).map(String) : []
  })

  // Append-only JSONL log of failed-fetch diagnostics. The renderer's
  // tracedFetch wrapper writes one entry per failure (with optional follow-up
  // entries when a transparent retry recovers or fails). Useful for the next
  // reproduction: tail the file to see exactly which seam of the request
  // lifecycle broke. Best-effort — write failures are silently ignored so
  // diagnostic logging never breaks the app.
  ipcMain.handle('debug:log-diagnostic', async (_event, entry: unknown) => {
    try {
      const dir = getDataDir()
      if (!existsSync(dir)) await mkdir(dir, { recursive: true, mode: 0o700 })
      const file = path.join(dir, 'fetch-diagnostics.log')
      const payload = entry && typeof entry === 'object' ? entry : { value: entry }
      const line = JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n'
      await writeFile(file, line, { flag: 'a' })
    } catch { /* swallow */ }
  })

  // Override mermaid renderer with Electron BrowserWindow-based renderer
  // (faster and works offline, unlike the kroki.io API fallback).
  // Renders to PNG <img> tags — SVGs render poorly in most e-readers.
  const { sanitizeMermaidChart } = await import('../client/lib/sanitize-mermaid.js')
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

  // POST all saved API keys to the server's key store. loadApiKey handles
  // identity-suffix paths, legacy fallback, and migration; failures are
  // logged but never delete the .enc file.
  console.log(`[apiKey] startup — populating server keys (identity=${SAFESTORAGE_IDENTITY})`)
  for (const provider of VALID_PROVIDERS) {
    const key = await loadApiKey(provider)
    if (!key) continue
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/settings/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      })
      console.log(`[apiKey] startup — posted ${provider} key to server`)
    } catch (err) {
      console.warn(`[apiKey] startup — failed to POST ${provider} key: ${(err as Error).message}`)
    }
  }
  // Also try loading the unsuffixed legacy file (no provider) as anthropic
  const legacyAnthropic = await loadApiKey()
  if (legacyAnthropic) {
    try {
      await fetch(`http://127.0.0.1:${apiPort}/api/settings/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic', apiKey: legacyAnthropic }),
      })
      console.log(`[apiKey] startup — posted legacy (no-provider) key to server as anthropic`)
    } catch (err) {
      console.warn(`[apiKey] startup — failed to POST legacy key: ${(err as Error).message}`)
    }
  }

  // CSP enforcement
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'${VITE_DEV_SERVER_URL ? " 'unsafe-inline'" : ''}; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; ` +
          `connect-src 'self' http://127.0.0.1:* http://localhost:*${VITE_DEV_SERVER_URL ? ' ws://localhost:*' : ''}; img-src 'self' data: http://127.0.0.1:* http://localhost:*; font-src 'self'; media-src 'self' blob: http://127.0.0.1:* http://localhost:*;`,
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
