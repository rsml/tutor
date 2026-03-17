import { describe, it, expect, beforeEach } from 'vitest'
import { setMermaidRenderer, renderMermaidCharts, resetMermaidRenderer } from './mermaid-renderer'

describe('mermaid-renderer', () => {
  beforeEach(() => {
    resetMermaidRenderer()
  })

  it('returns empty array when no renderer is set', async () => {
    const result = await renderMermaidCharts(['graph TD\n  A --> B'])
    expect(result).toEqual([])
  })

  it('calls injected renderer with chart sources', async () => {
    const mockRenderer = async (charts: string[]) => charts.map(() => '<svg>mock</svg>')
    setMermaidRenderer(mockRenderer)

    const result = await renderMermaidCharts(['graph TD\n  A --> B', 'graph LR\n  X --> Y'])
    expect(result).toEqual(['<svg>mock</svg>', '<svg>mock</svg>'])
  })

  it('returns empty array if renderer throws', async () => {
    setMermaidRenderer(async () => { throw new Error('boom') })
    const result = await renderMermaidCharts(['graph TD\n  A --> B'])
    expect(result).toEqual([])
  })

  it('handles empty input', async () => {
    setMermaidRenderer(async (charts) => charts.map(() => '<svg/>'))
    const result = await renderMermaidCharts([])
    expect(result).toEqual([])
  })
})
