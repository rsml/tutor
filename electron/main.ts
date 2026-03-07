import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getDataDir } from '../lib/data-dir.js'

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
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// --- Redux-persist file storage IPC ---

const dataDir = getDataDir()
const stateFile = path.join(dataDir, 'redux-state.json')

async function ensureDataDir() {
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }
}

ipcMain.handle('storage:get', async (_event, key: string) => {
  await ensureDataDir()
  if (!existsSync(stateFile)) return null
  try {
    const data = JSON.parse(await readFile(stateFile, 'utf-8'))
    return data[key] ?? null
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
  createWindow()
})
