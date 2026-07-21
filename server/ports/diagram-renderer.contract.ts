import { describe, it, expect, beforeEach } from 'vitest'
import type { DiagramRenderer } from './diagram-renderer.js'

/**
 * The behavioural contract every DiagramRenderer implementation must
 * satisfy.
 *
 * This contract is fake only. The real implementations call out to
 * kroki.io over HTTP or spin up an offscreen Electron BrowserWindow, see
 * diagram-renderer.ts's header comment for both, and neither belongs in a
 * unit test. No test in this repository may run this contract against
 * either real implementation.
 */
export function describeDiagramRendererContract(
  label: string,
  makeSubject: () => DiagramRenderer | Promise<DiagramRenderer>,
): void {
  describe(`DiagramRenderer contract (${label})`, () => {
    let subject: DiagramRenderer

    beforeEach(async () => {
      subject = await makeSubject()
    })

    it('returns exactly one result per input chart, in the same order', async () => {
      const charts = ['graph TD; A-->B', 'graph LR; X-->Y', 'sequenceDiagram; A->>B: hi']
      const results = await subject.render(charts)
      expect(results).toHaveLength(charts.length)
    })

    it('yields an empty string rather than throwing for a chart that fails', async () => {
      const results = await subject.render(['graph TD; A-->B', ''])
      expect(results[1]).toBe('')
    })

    it('does not fail the whole batch when one chart fails', async () => {
      const results = await subject.render(['', 'graph TD; A-->B'])
      expect(results[0]).toBe('')
      expect(results[1]).not.toBe('')
    })

    it('returns an empty array for an empty input array', async () => {
      const results = await subject.render([])
      expect(results).toEqual([])
    })
  })
}
