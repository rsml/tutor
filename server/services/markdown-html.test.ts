import { describe, it, expect } from 'vitest'
import { markdownToHtml } from './markdown-html'

describe('markdownToHtml', () => {
  describe('default mode (no options)', () => {
    it('converts basic markdown to HTML', async () => {
      const html = await markdownToHtml('# Hello\n\nWorld')
      expect(html).toContain('<h1>Hello</h1>')
      expect(html).toContain('<p>World</p>')
    })

    it('returns a string, not an object', async () => {
      const result = await markdownToHtml('test')
      expect(typeof result).toBe('string')
    })

    it('does not process KaTeX in default mode', async () => {
      const html = await markdownToHtml('Inline $E = mc^2$ here')
      expect(html).not.toContain('class="katex"')
    })
  })

  describe('preserveSources mode', () => {
    it('renders inline KaTeX with source preservation', async () => {
      const result = await markdownToHtml('Inline $E = mc^2$ here', { preserveSources: true })
      expect(result.html).toContain('class="katex"')
      expect(result.html).toContain('data-tutor-type="katex-inline"')
      expect(result.html).toContain('E = mc^2')
      expect(result.html).toContain('display:none')
    })

    it('renders display KaTeX with source preservation', async () => {
      const result = await markdownToHtml('$$\n\\int_0^1 x^2 dx\n$$', { preserveSources: true })
      expect(result.html).toContain('class="katex"')
      expect(result.html).toContain('data-tutor-type="katex-display"')
      expect(result.html).toContain('\\int_0^1 x^2 dx')
      expect(result.html).toContain('display:none')
    })

    it('extracts mermaid blocks as placeholders', async () => {
      const md = '# Title\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nDone.'
      const result = await markdownToHtml(md, { preserveSources: true })
      expect(result.mermaidBlocks).toHaveLength(1)
      expect(result.mermaidBlocks[0].source).toBe('graph TD\n  A --> B')
      expect(result.html).toContain(result.mermaidBlocks[0].placeholder)
      expect(result.html).not.toContain('language-mermaid')
    })

    it('handles multiple mermaid blocks', async () => {
      const md = '```mermaid\ngraph TD\n  A --> B\n```\n\nText\n\n```mermaid\ngraph LR\n  X --> Y\n```'
      const result = await markdownToHtml(md, { preserveSources: true })
      expect(result.mermaidBlocks).toHaveLength(2)
      expect(result.mermaidBlocks[0].source).toBe('graph TD\n  A --> B')
      expect(result.mermaidBlocks[1].source).toBe('graph LR\n  X --> Y')
    })

    it('preserves non-mermaid code blocks', async () => {
      const md = '```js\nconsole.log("hi")\n```'
      const result = await markdownToHtml(md, { preserveSources: true })
      expect(result.mermaidBlocks).toHaveLength(0)
      expect(result.html).toContain('console.log')
    })

    it('handles markdown with no math or mermaid', async () => {
      const result = await markdownToHtml('# Just text', { preserveSources: true })
      expect(result.html).toContain('<h1>Just text</h1>')
      expect(result.mermaidBlocks).toHaveLength(0)
    })
  })
})
