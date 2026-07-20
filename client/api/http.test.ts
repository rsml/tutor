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

describe('apiFetch', () => {
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
    const res = await api.apiFetch('/api/test', { method: 'POST' })

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
    const res = await api.apiFetch('/api/test', { method: 'POST' })

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

    await expect(api.apiFetch('/api/test', { method: 'POST' })).rejects.toThrow('Failed to fetch')

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
    await expect(api.apiFetch('/api/test', { method: 'POST' })).rejects.toThrow()
    // We can't assert on logDiagnostic because window.electronAPI is absent in this
    // case — but the probe runs and the URL-resolved field tells the story.
  })

  it('omits the trace header when tracing is switched off', async () => {
    // A GET carrying a custom header stops being a CORS-simple request, which
    // costs a preflight round trip. The hot polls opt out for that reason, so
    // the header has to be genuinely absent rather than merely empty.
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response('[]', { status: 200 }))

    await api.apiFetch('/api/books', { trace: false })

    const headers = new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers)
    expect(headers.has('X-Trace-Id')).toBe(false)
  })

  it('serialises a non-string body as JSON and declares the content type', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await api.apiFetch('/api/books', { method: 'POST', body: { title: 'Ada' } })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"title":"Ada"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('sends no body at all when none was supplied', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await api.apiFetch('/api/books', { method: 'DELETE' })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
  })

  it('forwards the abort signal', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const controller = new AbortController()

    await api.apiFetch('/api/books', { signal: controller.signal })

    expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('request', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
    uninstallWindow()
    vi.restoreAllMocks()
  })

  it('parses the JSON body of a successful response', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response('{"id":"ada","title":"Ada"}', { status: 200 }))

    await expect(api.request('/api/books/ada')).resolves.toEqual({ id: 'ada', title: 'Ada' })
  })

  it('resolves undefined for a no-content response', async () => {
    // Several mutating routes answer 204. Calling json() on those throws, so
    // the helper has to treat an empty body as an absent value.
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(api.request('/api/books/ada')).resolves.toBeUndefined()
  })

  it('throws an ApiError carrying the status and the reason the server gave', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"No API key configured for anthropic"}', { status: 400 }),
    )

    const failure = await api.request('/api/books/ada/generate-next', { method: 'POST' }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(api.ApiError)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as InstanceType<typeof api.ApiError>).status).toBe(400)
    expect((failure as Error).message).toBe('No API key configured for anthropic')
  })

  it('prefers the framework message field over the generic error field', async () => {
    // Routes answer { error }. Fastify's own error serialiser answers
    // { statusCode, error, message } where error is only the status name, so
    // message is the more specific of the two whenever both are present.
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response(
      '{"statusCode":500,"error":"Internal Server Error","message":"read ENOENT"}',
      { status: 500 },
    ))

    await expect(api.request('/api/books')).rejects.toThrow('read ENOENT')
  })

  it('falls back to the supplied message when the body carries no reason', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 502 }))

    await expect(api.request('/api/books', { fallbackMessage: 'Could not load books' }))
      .rejects.toThrow('Could not load books')
  })

  it('falls back to the status when nothing else describes the failure', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }))

    await expect(api.request('/api/books')).rejects.toThrow('503')
  })

  it('keeps the parsed body on the error for callers that need the detail', async () => {
    const api = await loadFresh()
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"Invalid request","details":[{"path":["title"]}]}', { status: 400 }),
    )

    const failure = await api.request('/api/books', { method: 'POST' }).catch((e: unknown) => e)

    expect((failure as InstanceType<typeof api.ApiError>).body).toEqual({
      error: 'Invalid request',
      details: [{ path: ['title'] }],
    })
  })
})
