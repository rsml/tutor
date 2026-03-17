import { describe, it, expect } from 'vitest'
import TurndownService from 'turndown'

// We can't easily test the full importEpub flow (needs epub2 + filesystem),
// but we can test the Turndown rules by replicating the setup.

// Re-create the addTutorSourceRules logic inline since it's a private function.
// This tests the same patterns the importer uses.
//
// Note: epub-gen-memory strips data-* attributes from XHTML output, so all
// Tutor metadata uses class names for identification.
function createTurndownWithTutorRules(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })

  const hasClass = (node: Node, cls: string) =>
    (node as HTMLElement).classList?.contains?.(cls) === true

  turndown.addRule('tutor-mermaid-source', {
    filter: (node) => hasClass(node, 'tutor-mermaid-source'),
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `\n\n\`\`\`mermaid\n${raw}\n\`\`\`\n\n`
    },
  })

  turndown.addRule('tutor-katex-inline', {
    filter: (node) => hasClass(node, 'tutor-katex-inline'),
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `$${raw}$`
    },
  })

  turndown.addRule('tutor-katex-display', {
    filter: (node) => hasClass(node, 'tutor-katex-display'),
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `\n\n$$\n${raw}\n$$\n\n`
    },
  })

  turndown.addRule('tutor-mermaid-rendered', {
    filter: (node) => hasClass(node, 'tutor-mermaid-rendered'),
    replacement: () => '',
  })

  turndown.addRule('tutor-katex-rendered', {
    filter: (node) => {
      const classes = (node as HTMLElement).classList
      if (!classes) return false
      return classes.contains('katex') || classes.contains('katex-display')
    },
    replacement: () => '',
  })

  return turndown
}

describe('Tutor EPUB source recovery rules', () => {
  const turndown = createTurndownWithTutorRules()

  it('recovers mermaid source from hidden div', () => {
    const html = `
      <div class="tutor-mermaid-rendered"><svg>diagram</svg></div>
      <div class="tutor-mermaid-source" style="display:none">graph TD
  A["Start"] --&gt; B["End"]</div>
    `
    const md = turndown.turndown(html)
    expect(md).toContain('```mermaid')
    expect(md).toContain('graph TD')
    expect(md).toContain('A["Start"]')
    expect(md).not.toContain('<svg>')
  })

  it('recovers inline KaTeX source from hidden span', () => {
    const html = `
      <p>The equation <span class="katex"><span class="katex-html">rendered</span></span><span class="tutor-katex-inline" style="display:none">E = mc^2</span> is famous.</p>
    `
    const md = turndown.turndown(html)
    expect(md).toContain('$E = mc^2$')
    expect(md).not.toContain('rendered')
  })

  it('recovers display KaTeX source from hidden div', () => {
    const html = `
      <div class="katex-display"><span class="katex">rendered</span></div>
      <div class="tutor-katex-display" style="display:none">\\int_0^1 x^2 dx</div>
    `
    const md = turndown.turndown(html)
    expect(md).toContain('$$')
    expect(md).toContain('\\int_0^1 x^2 dx')
    expect(md).not.toContain('rendered')
  })

  it('passes through non-Tutor HTML unchanged', () => {
    const html = '<p>Just a paragraph with <strong>bold</strong> text.</p>'
    const md = turndown.turndown(html)
    expect(md).toContain('Just a paragraph with **bold** text.')
  })

  it('handles HTML entities in mermaid source', () => {
    const html = `
      <div class="tutor-mermaid-rendered"><svg>diagram</svg></div>
      <div class="tutor-mermaid-source" style="display:none">graph TD
  A["Auth &amp; Access"] --&gt; B["Read &amp; Write"]</div>
    `
    const md = turndown.turndown(html)
    expect(md).toContain('```mermaid')
    // Turndown decodes HTML entities
    expect(md).toContain('Auth & Access')
  })
})
