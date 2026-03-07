import { app, BrowserWindow, Menu, ipcMain, safeStorage, nativeImage, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getDataDir } from '../lib/data-dir.js'
import { startServer } from '../server/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
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
          "connect-src 'self' http://127.0.0.1:*; img-src 'self' data:; font-src 'self';",
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
