import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  renderMermaidBlockHtml,
  substituteMermaidPlaceholder,
  embedChapterDescription,
  embedBookMeta,
} from './epub-embedding.js'

// Pure hidden-div round-trip markup used by the EPUB exporter and read back
// by the importer (server/adapters/epub2-import.ts). No ports, no I/O.

describe('escapeHtml', () => {
  it('escapes ampersand, less-than, and greater-than', () => {
    expect(escapeHtml('A & B <tag> "quoted"')).toBe('A &amp; B &lt;tag&gt; "quoted"')
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('graph TD')).toBe('graph TD')
  })
})

describe('renderMermaidBlockHtml', () => {
  const source = 'graph TD\n  A["Start"] --> B["End"]'

  it('wraps a successfully rendered svg in a tutor-mermaid-rendered div, with the escaped source hidden alongside it', () => {
    const html = renderMermaidBlockHtml(source, '<svg data-fake="1"></svg>')
    expect(html).toBe(
      '<div class="tutor-mermaid-rendered"><svg data-fake="1"></svg></div>' +
      '<div class="tutor-mermaid-source" style="display:none">graph TD\n  A["Start"] --&gt; B["End"]</div>',
    )
  })

  it('falls back to an escaped code block when svg is undefined (renderer unavailable or the whole batch failed)', () => {
    const html = renderMermaidBlockHtml(source, undefined)
    expect(html).toBe(
      '<pre><code class="language-mermaid">graph TD\n  A["Start"] --&gt; B["End"]</code></pre>' +
      '<div class="tutor-mermaid-source" style="display:none">graph TD\n  A["Start"] --&gt; B["End"]</div>',
    )
  })

  it('falls back when svg is an empty string, the old DiagramRenderer contract for a failed chart', () => {
    const html = renderMermaidBlockHtml(source, '')
    expect(html).toContain('<pre><code class="language-mermaid">')
    expect(html).not.toContain('tutor-mermaid-rendered')
  })

  it('falls back when svg is diagramSourceFallback output, the current DiagramRenderer contract for a failed chart', () => {
    // diagramSourceFallback always starts with "<pre>", which is exactly the
    // marker this function uses to detect "not really rendered".
    const fallbackFromPort = '<pre><code class="language-mermaid">graph TD\n  A[&quot;Start&quot;]</code></pre>'
    const html = renderMermaidBlockHtml(source, fallbackFromPort)
    expect(html).not.toContain('tutor-mermaid-rendered')
    expect(html).not.toContain(fallbackFromPort)
    // Rebuilds its own fallback from the raw source instead of reusing the
    // port's fallback markup verbatim (see the function's own doc comment).
    expect(html).toContain('<pre><code class="language-mermaid">graph TD\n  A["Start"] --&gt; B["End"]</code></pre>')
  })
})

describe('substituteMermaidPlaceholder', () => {
  it('replaces the placeholder div with the rendered markup', () => {
    const html = '<p>Before</p><div data-mermaid-placeholder="__MERMAID_PLACEHOLDER_0__">__MERMAID_PLACEHOLDER_0__</div><p>After</p>'
    const result = substituteMermaidPlaceholder(html, '__MERMAID_PLACEHOLDER_0__', '<p>REPLACED</p>')
    expect(result).toBe('<p>Before</p><p>REPLACED</p><p>After</p>')
  })
})

describe('embedChapterDescription', () => {
  it('prepends a hidden tutor-chapter-description div carrying the escaped description', () => {
    const html = embedChapterDescription('<p>Body</p>', 'A chapter about <cats> & dogs')
    expect(html).toBe(
      '<div class="tutor-chapter-description" style="display:none">A chapter about &lt;cats&gt; &amp; dogs</div>\n<p>Body</p>',
    )
  })

  it('embeds nothing for a blank description', () => {
    expect(embedChapterDescription('<p>Body</p>', '')).toBe('<p>Body</p>')
  })
})

describe('embedBookMeta', () => {
  it('embeds both fields as a hidden tutor-book-meta JSON div when both are set', () => {
    // escapeHtml only touches &, <, > (see its own test above), so
    // JSON.stringify's double quotes pass through unescaped, exactly as the
    // exporter has always emitted them.
    const html = embedBookMeta('<p>Body</p>', { showTitleOnCover: true, subtitle: 'A Subtitle' })
    expect(html).toBe(
      '<div class="tutor-book-meta" style="display:none">{"showTitleOnCover":true,"subtitle":"A Subtitle"}</div>\n<p>Body</p>',
    )
  })

  it('embeds only showTitleOnCover when subtitle is absent', () => {
    const html = embedBookMeta('<p>Body</p>', { showTitleOnCover: false })
    expect(html).toContain('"showTitleOnCover":false')
    expect(html).not.toContain('subtitle')
  })

  it('embeds nothing when neither field is set', () => {
    expect(embedBookMeta('<p>Body</p>', {})).toBe('<p>Body</p>')
  })

  it('embeds nothing for an empty-string subtitle', () => {
    expect(embedBookMeta('<p>Body</p>', { subtitle: '' })).toBe('<p>Body</p>')
  })
})
