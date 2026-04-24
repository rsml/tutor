let _base = ''

export async function initApiBase() {
  if (window.electronAPI) {
    const port = await window.electronAPI.getApiPort()
    _base = `http://127.0.0.1:${port}`
  }
  // In web/dev mode, _base stays '' (relative paths work via Vite proxy)
}

export function apiUrl(path: string): string {
  return `${_base}${path}`
}

/** Returns the API server port (from Electron IPC or default 3147). */
export function getApiPort(): number {
  if (!_base) return 3147
  try {
    return new URL(_base).port ? parseInt(new URL(_base).port) : 3147
  } catch {
    return 3147
  }
}
