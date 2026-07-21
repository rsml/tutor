import { readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { diagramSourceFallback } from '../ports/diagram-renderer.js'
import { createKrokiDiagramRenderer } from './kroki-diagram-renderer.js'

/**
 * These tests never hit the real kroki.io network endpoint: fetch is always
 * injected. The success path still writes a real (tiny) temp PNG file, the
 * same as the real adapter does, since that part is plain local disk I/O
 * with no external dependency; each such test cleans its file up.
 */

function fakeOkResponse(bytes: number[]): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    text: async () => '',
  } as unknown as Response
}

function fakeFailedResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => body,
  } as unknown as Response
}

/** Extracts the file:// path embedded in an <img src="..."> tag, for cleanup. */
function extractImgPath(markup: string): string {
  const match = markup.match(/src="([^"]+)"/)
  if (!match) throw new Error(`no src found in: ${markup}`)
  return fileURLToPath(match[1])
}

describe('createKrokiDiagramRenderer (whitebox)', () => {
  it('never hits the network: renders via the injected fetch only', async () => {
    const fetchImpl = vi.fn(async () => fakeOkResponse([1, 2, 3, 4]))
    const renderer = createKrokiDiagramRenderer({ fetch: fetchImpl as unknown as typeof fetch })

    const [result] = await renderer.render(['graph TD; A-->B'])
    const tmpPath = extractImgPath(result)
    try {
      expect(result).toContain('<img src="file://')
      expect(await readFile(tmpPath)).toEqual(Buffer.from([1, 2, 3, 4]))
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://kroki.io/mermaid/png',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'graph TD; A-->B',
        }),
      )
    } finally {
      await rm(tmpPath, { force: true })
    }
  })

  it('yields the escaped source fallback, never an empty string, when kroki.io responds not-ok', async () => {
    const fetchImpl = vi.fn(async () => fakeFailedResponse(500, 'internal error'))
    const renderer = createKrokiDiagramRenderer({ fetch: fetchImpl as unknown as typeof fetch })

    const [result] = await renderer.render(['graph TD; A-->B'])

    expect(result).toBe(diagramSourceFallback('graph TD; A-->B'))
    expect(result).not.toBe('')
  })

  it('yields the escaped source fallback, never an empty string, when fetch throws', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })
    const renderer = createKrokiDiagramRenderer({ fetch: fetchImpl as unknown as typeof fetch })

    const [result] = await renderer.render(['graph TD; A-->B'])

    expect(result).toBe(diagramSourceFallback('graph TD; A-->B'))
    expect(result).not.toBe('')
  })

  it('yields the escaped source fallback when the request times out (AbortError)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'AbortError')
    })
    const renderer = createKrokiDiagramRenderer({ fetch: fetchImpl as unknown as typeof fetch, timeoutMs: 5 })

    const [result] = await renderer.render(['sequenceDiagram; A->>B: hi'])

    expect(result).toBe(diagramSourceFallback('sequenceDiagram; A->>B: hi'))
  })

  it('does not fail the whole batch when one chart fails and keeps results in order', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      if (init.body === 'bad-chart') return fakeFailedResponse(500, 'boom')
      return fakeOkResponse([9, 9])
    })
    const renderer = createKrokiDiagramRenderer({ fetch: fetchImpl as unknown as typeof fetch })

    const results = await renderer.render(['good-chart-1', 'bad-chart', 'good-chart-2'])
    try {
      expect(results).toHaveLength(3)
      expect(results[0]).not.toBe(diagramSourceFallback('good-chart-1'))
      expect(results[1]).toBe(diagramSourceFallback('bad-chart'))
      expect(results[2]).not.toBe(diagramSourceFallback('good-chart-2'))
      for (const result of results) expect(result).not.toBe('')
    } finally {
      await rm(extractImgPath(results[0]), { force: true })
      await rm(extractImgPath(results[2]), { force: true })
    }
  })

  it('returns an empty array for an empty input without calling fetch', async () => {
    const fetchImpl = vi.fn()
    const renderer = createKrokiDiagramRenderer({ fetch: fetchImpl as unknown as typeof fetch })

    const results = await renderer.render([])

    expect(results).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
