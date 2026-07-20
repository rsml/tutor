import { describe, it, expect } from 'vitest'
import { themeCSS, themeVariables, mermaidInitConfig } from './mermaid-theme'

describe('mermaid-theme', () => {
  it('exports themeCSS as a non-empty string', () => {
    expect(typeof themeCSS).toBe('string')
    expect(themeCSS.length).toBeGreaterThan(0)
  })

  it('exports themeVariables with required keys', () => {
    expect(themeVariables).toHaveProperty('primaryColor')
    expect(themeVariables).toHaveProperty('lineColor')
    expect(themeVariables).toHaveProperty('fontFamily')
  })

  it('themeCSS contains node styling', () => {
    expect(themeCSS).toContain('.nodeLabel')
    expect(themeCSS).toContain('.edgeLabel')
  })

  it('all themeVariables values are strings', () => {
    for (const [, v] of Object.entries(themeVariables)) {
      expect(typeof v).toBe('string')
    }
  })

  it('exports mermaidInitConfig with theme base', () => {
    expect(mermaidInitConfig).toHaveProperty('theme', 'base')
    expect(mermaidInitConfig).toHaveProperty('themeCSS')
    expect(mermaidInitConfig).toHaveProperty('themeVariables')
    expect(mermaidInitConfig).toHaveProperty('startOnLoad', false)
  })
})
