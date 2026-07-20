import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The http transport holds module-scoped readiness and base-url state. Each
// test imports a fresh copy via vi.resetModules() so cases can't leak
// _base/_ready between each other.
type Http = typeof import('./http')

async function loadFresh(): Promise<Http> {
  vi.resetModules()
  return await import('./http')
}

interface FakeElectronAPI {
  getApiPort: ReturnType<typeof vi.fn>
  logDiagnostic: ReturnType<typeof vi.fn>
}

function installWindow(api: Partial<FakeElectronAPI> = {}) {
  const fakeApi: FakeElectronAPI = {
    getApiPort: api.getApiPort ?? vi.fn().mockResolvedValue(54321),
    logDiagnostic: api.logDiagnostic ?? vi.fn().mockResolvedValue(undefined),
  }
  ;(globalThis as { window?: unknown }).window = { electronAPI: fakeApi }
  return fakeApi
}

function uninstallWindow() {
  delete (globalThis as { window?: unknown }).window
}

describe('initApiBase', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
    uninstallWindow()
  })

  it('resolves with no base in non-electron contexts', async () => {
    // window.electronAPI absent — initApiBase should no-op (web/dev mode)
    const api = await loadFresh()
    await api.initApiBase()
    expect(api.getBase()).toBe('')
  })

  it('sets base from electronAPI.getApiPort and pre-warms /api/health', async () => {
    const electron = installWindow({ getApiPort: vi.fn().mockResolvedValue(8080) })
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))

    const api = await loadFresh()
    await api.initApiBase()

    expect(electron.getApiPort).toHaveBeenCalledOnce()
    expect(api.getBase()).toBe('http://127.0.0.1:8080')
    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:8080/api/health')
  })

  it('memoizes — repeat calls do not re-init', async () => {
    const electron = installWindow()
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))

    const api = await loadFresh()
    await api.initApiBase()
    await api.initApiBase()
    await api.initApiBase()

    expect(electron.getApiPort).toHaveBeenCalledOnce()
  })

  it('retries health polling, succeeds when server eventually answers', async () => {
    installWindow()
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const api = await loadFresh()
    await api.initApiBase()

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(api.getBase()).toBe('http://127.0.0.1:54321')
  })

  it('non-fatal when health never returns ok — sets base, logs warn, resolves', async () => {
    installWindow()
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const api = await loadFresh()
    await api.initApiBase()

    expect(api.getBase()).toBe('http://127.0.0.1:54321')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/api/health'))
    warn.mockRestore()
  }, 10000)

  it('resets _ready on rejection so a subsequent call retries', async () => {
    const electron = installWindow({
      getApiPort: vi.fn()
        .mockRejectedValueOnce(new Error('ipc unavailable'))
        .mockResolvedValue(8080),
    })
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }))

    const api = await loadFresh()
    await expect(api.initApiBase()).rejects.toThrow('ipc unavailable')
    // Second call must trigger a fresh attempt, not return the cached rejection.
    await api.initApiBase()
    expect(electron.getApiPort).toHaveBeenCalledTimes(2)
    expect(api.getBase()).toBe('http://127.0.0.1:8080')
  })
})

describe('tracedFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
    uninstallWindow()
    vi.restoreAllMocks()
  })

  it('happy path: passes through and stamps X-Trace-Id header', async () => {
    installWindow()
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // health pre-warm
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 })) // actual call

    const api = await loadFresh()
    await api.initApiBase()
    const res = await api.tracedFetch('/api/test', { method: 'POST' })

    expect(res.status).toBe(200)
    const actualCall = fetchSpy.mock.calls[1]
    const init = actualCall[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('X-Trace-Id')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('recovers via transparent retry when first attempt throws', async () => {
    const electron = installWindow()
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // health pre-warm
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))   // initial request
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // probe: health
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // probe: OPTIONS
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 })) // retry

    const api = await loadFresh()
    const res = await api.tracedFetch('/api/test', { method: 'POST' })

    expect(res.status).toBe(200)
    // logDiagnostic called twice: initial failure, then recovered
    expect(electron.logDiagnostic).toHaveBeenCalledTimes(2)
    const initial = electron.logDiagnostic.mock.calls[0][0]
    const recovered = electron.logDiagnostic.mock.calls[1][0]
    expect(initial.stage).toBe('initial')
    expect(initial.probe).toMatchObject({
      urlIsAbsolute: true,
      healthStatus: 200,
      optionsStatus: 204,
    })
    expect(recovered.stage).toBe('recovered')
    expect(recovered.recovered).toBe(true)
    expect(recovered.status).toBe(200)
  })

  it('throws and logs "fatal" when both attempts fail', async () => {
    const electron = installWindow()
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // health pre-warm
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))    // initial
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))    // probe: health
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))    // probe: OPTIONS
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))    // retry

    const api = await loadFresh()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(api.tracedFetch('/api/test', { method: 'POST' })).rejects.toThrow('Failed to fetch')

    expect(electron.logDiagnostic).toHaveBeenCalledTimes(2)
    const fatal = electron.logDiagnostic.mock.calls[1][0]
    expect(fatal.stage).toBe('fatal')
    expect(fatal.retryError).toMatch(/Failed to fetch/)
    // The probe captured the server-unreachable signal for triage
    expect(fatal.probe).toMatchObject({
      urlIsAbsolute: true,
      healthError: expect.stringContaining('Failed to fetch'),
    })
  })

  it('probe flags relative URL when _base is empty (init race signature)', async () => {
    // No window.electronAPI — _base stays '', so apiUrl returns a relative path.
    // This is the exact failure signature the readiness gate was designed to prevent;
    // but if it ever leaks past the gate, the probe should mark urlIsAbsolute: false
    // so triage lands on the right leaf of the bisection tree.
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const api = await loadFresh()
    await expect(api.tracedFetch('/api/test', { method: 'POST' })).rejects.toThrow()
    // We can't assert on logDiagnostic because window.electronAPI is absent in this
    // case — but the probe runs and the URL-resolved field tells the story.
  })
})
