# EPUB Mermaid & KaTeX Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render mermaid diagrams as SVG and KaTeX as styled HTML in exported EPUBs, with hidden source elements for future round-trip import.

**Architecture:** The unified markdown-to-HTML pipeline gains two new capabilities behind a `preserveSources` flag: KaTeX rendering (server-side, no DOM) and mermaid placeholder extraction (rendered later via Electron's offscreen BrowserWindow). The EPUB export route orchestrates both, batch-rendering mermaid charts and inlining KaTeX CSS.

**Tech Stack:** unified/remark/rehype pipeline, rehype-katex, remark-math, mermaid (via Electron BrowserWindow), epub-gen-memory

**Spec:** `docs/superpowers/specs/2026-03-16-epub-mermaid-katex-rendering-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/mermaid-theme.ts` | **New.** Shared OKLCH palette, themeCSS, themeVariables — imported by both frontend and Electron renderer |
| `lib/mermaid-theme.test.ts` | **New.** Tests for theme export shape |
| `server/services/mermaid-renderer.ts` | **New.** Injectable mermaid rendering service (`setMermaidRenderer` / `renderMermaidCharts`) |
| `server/services/mermaid-renderer.test.ts` | **New.** Tests for renderer contract and fallback behavior |
| `server/services/markdown-html.ts` | Enhanced with overloaded signatures, KaTeX rendering, source preservation plugin, mermaid extraction |
| `server/services/markdown-html.test.ts` | **New.** Tests for both default and `preserveSources` modes |
| `src/components/MermaidDiagram.tsx` | Refactored to import theme from shared module |
| `electron/main.ts` | Register mermaid renderer after app ready |
| `server/routes/books.ts` | EPUB export route uses enhanced pipeline + batch mermaid rendering |

---

## Chunk 1: Extract Shared Mermaid Theme

### Task 1: Create shared mermaid theme module

**Files:**
- Create: `lib/mermaid-theme.ts`
- Create: `lib/mermaid-theme.test.ts`

The OKLCH palette, hex conversion, `themeCSS`, and `themeVariables` currently live inline in `src/components/MermaidDiagram.tsx:6-183`. Extract them into a shared module.

- [ ] **Step 1: Write failing test for theme exports**

Create `lib/mermaid-theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { themeCSS, themeVariables } from './mermaid-theme'

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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/mermaid-theme.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create lib/mermaid-theme.ts**

Extract from `src/components/MermaidDiagram.tsx:3-183`. The new file should contain:

1. The `oklchToHex` helper (import `formatHex`, `parse` from `culori`)
2. The `P` palette object (OKLCH colors)
3. The `H` hex palette object
4. The `themeCSS` template string
5. The `themeVariables` object (the argument to `mermaid.initialize`)

Export `themeCSS` and `themeVariables`. Also export `mermaidInitConfig` — the full config object for `mermaid.initialize()`:

```ts
export const mermaidInitConfig = {
  startOnLoad: false,
  theme: 'base' as const,
  themeCSS,
  themeVariables,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/mermaid-theme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mermaid-theme.ts lib/mermaid-theme.test.ts
git commit -m "feat: extract shared mermaid theme to lib/mermaid-theme.ts"
```

### Task 2: Refactor MermaidDiagram.tsx to use shared theme

**Files:**
- Modify: `src/components/MermaidDiagram.tsx`

- [ ] **Step 1: Replace inline theme with import**

In `src/components/MermaidDiagram.tsx`, remove:
- Lines 3-4: `import { formatHex, parse } from 'culori'` and `import { sanitizeMermaidChart } from '@src/lib/sanitize-mermaid'` — keep the sanitize import
- Lines 6-8: `oklchToHex` function
- Lines 10-31: `P` palette object
- Lines 33-39: `H` hex palette object
- Lines 41-115: `themeCSS` string
- Lines 117-183: `mermaid.initialize(...)` call

Replace with:

```ts
import mermaid from 'mermaid'
import { mermaidInitConfig } from '../../lib/mermaid-theme'
import { sanitizeMermaidChart } from '@src/lib/sanitize-mermaid'

mermaid.initialize(mermaidInitConfig)
```

The `culori` import is no longer needed here — it stays in `lib/mermaid-theme.ts`.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing sanitize-mermaid tests, book-store tests, etc.)

- [ ] **Step 3: Verify app renders**

Run: `pnpm electron:dev`
Open a book with mermaid diagrams. Verify they render with the same OKLCH theme as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/MermaidDiagram.tsx
git commit -m "refactor: MermaidDiagram uses shared theme from lib/mermaid-theme"
```

---

## Chunk 2: Mermaid Renderer Service

### Task 3: Create injectable mermaid renderer

**Files:**
- Create: `server/services/mermaid-renderer.ts`
- Create: `server/services/mermaid-renderer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/services/mermaid-renderer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/mermaid-renderer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mermaid-renderer.ts**

Create `server/services/mermaid-renderer.ts`:

```ts
type MermaidRendererFn = (charts: string[]) => Promise<string[]>

let renderer: MermaidRendererFn | null = null
let warnedOnce = false

export function setMermaidRenderer(fn: MermaidRendererFn): void {
  renderer = fn
}

export function resetMermaidRenderer(): void {
  renderer = null
  warnedOnce = false
}

export async function renderMermaidCharts(charts: string[]): Promise<string[]> {
  if (charts.length === 0) return []
  if (!renderer) {
    if (!warnedOnce) {
      console.warn('[mermaid-renderer] No renderer registered — mermaid diagrams will not be rendered in EPUB export')
      warnedOnce = true
    }
    return []
  }
  try {
    return await renderer(charts)
  } catch (err) {
    console.error('[mermaid-renderer] Batch render failed:', err)
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/services/mermaid-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/mermaid-renderer.ts server/services/mermaid-renderer.test.ts
git commit -m "feat: add injectable mermaid renderer service"
```

---

## Chunk 3: Enhanced markdownToHtml Pipeline

### Task 4: Add KaTeX + mermaid extraction + source preservation to markdownToHtml

**Files:**
- Modify: `server/services/markdown-html.ts`
- Create: `server/services/markdown-html.test.ts`

This is the largest task. The enhanced function builds a second unified processor (used only when `preserveSources: true`) that:
1. Adds `remark-math` + `rehype-katex` for math rendering
2. Runs a custom rehype plugin to add hidden source divs for KaTeX (extracts raw LaTeX from `<annotation encoding="application/x-tex">`)
3. Runs a custom rehype plugin to extract mermaid `<pre><code class="language-mermaid">` blocks, replace them with placeholder `<div>` elements, and collect the sources

- [ ] **Step 1: Write failing tests**

Create `server/services/markdown-html.test.ts`:

```ts
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
      // Should pass through as text, not rendered as KaTeX
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
      const result = await markdownToHtml('$$\\int_0^1 x^2 dx$$', { preserveSources: true })
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/services/markdown-html.test.ts`
Expected: FAIL — overloaded signature doesn't exist yet, `preserveSources` option not recognized

- [ ] **Step 3: Implement the enhanced markdownToHtml**

Rewrite `server/services/markdown-html.ts`. Key structure:

```ts
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import type { Root, Element, ElementContent } from 'hast'
import { visit } from 'unist-util-visit'

// --- Default processor (unchanged behavior) ---
const defaultProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify)

// --- Types ---
export interface MarkdownToHtmlResult {
  html: string
  mermaidBlocks: Array<{ placeholder: string; source: string }>
}

// --- Overloaded signatures ---
export function markdownToHtml(md: string): Promise<string>
export function markdownToHtml(md: string, opts: { preserveSources: true }): Promise<MarkdownToHtmlResult>
export async function markdownToHtml(
  md: string,
  opts?: { preserveSources?: boolean },
): Promise<string | MarkdownToHtmlResult> {
  if (!opts?.preserveSources) {
    const result = await defaultProcessor.process(md)
    return String(result)
  }

  const mermaidBlocks: Array<{ placeholder: string; source: string }> = []

  const epubProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypePreserveKatexSources)
    .use(rehypeExtractMermaid, { mermaidBlocks })
    .use(rehypeStringify)

  const result = await epubProcessor.process(md)
  return { html: String(result), mermaidBlocks }
}
```

**rehypePreserveKatexSources plugin:**

Walks the HAST tree. For each `<span class="katex">` or `<span class="katex-display">`:
1. Extract raw LaTeX from the nested `<annotation encoding="application/x-tex">` element
2. Determine if inline or display from the class name
3. Wrap the katex node in a container element
4. Insert a hidden sibling after it with `data-tutor-type` and `style="display:none"`

```ts
function rehypePreserveKatexSources() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined) return
      const classes = Array.isArray(node.properties?.className)
        ? (node.properties.className as string[])
        : []

      const isDisplay = classes.includes('katex-display')
      const isInline = !isDisplay && classes.includes('katex')
      if (!isInline && !isDisplay) return

      // Extract raw source from <annotation encoding="application/x-tex">
      const source = extractAnnotationText(node)
      if (!source) return

      const type = isDisplay ? 'katex-display' : 'katex-inline'
      const tag = isDisplay ? 'div' : 'span'

      // Create hidden source sibling
      const sourceNode: Element = {
        type: 'element',
        tagName: tag,
        properties: {
          className: [`tutor-${type.replace('-', '-')}-source`],
          style: 'display:none',
          'data-tutor-type': type,
        },
        children: [{ type: 'text', value: source }],
      }

      // Insert source node after the katex node
      parent.children.splice(index + 1, 0, sourceNode as ElementContent)

      // Skip the newly inserted node
      return index + 2
    })
  }
}

function extractAnnotationText(node: Element): string | null {
  let result: string | null = null
  visit({ type: 'root', children: [node] } as Root, 'element', (child) => {
    if (
      child.tagName === 'annotation' &&
      child.properties?.encoding === 'application/x-tex' &&
      child.children[0]?.type === 'text'
    ) {
      result = child.children[0].value
    }
  })
  return result
}
```

**rehypeExtractMermaid plugin:**

Finds `<pre><code class="language-mermaid">` blocks, extracts the source, replaces with a placeholder `<div>`:

```ts
function rehypeExtractMermaid(opts: { mermaidBlocks: Array<{ placeholder: string; source: string }> }) {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined) return
      if (node.tagName !== 'pre') return

      const code = node.children.find(
        (c): c is Element => c.type === 'element' && c.tagName === 'code'
      )
      if (!code) return

      const classes = Array.isArray(code.properties?.className)
        ? (code.properties.className as string[])
        : []
      if (!classes.includes('language-mermaid')) return

      // Extract text content
      const source = code.children
        .filter((c): c is { type: 'text'; value: string } => c.type === 'text')
        .map(c => c.value)
        .join('')

      const placeholder = `__MERMAID_PLACEHOLDER_${opts.mermaidBlocks.length}__`
      opts.mermaidBlocks.push({ placeholder, source })

      // Replace <pre> with placeholder div
      const placeholderNode: Element = {
        type: 'element',
        tagName: 'div',
        properties: { 'data-mermaid-placeholder': placeholder },
        children: [{ type: 'text', value: placeholder }],
      }
      parent.children[index] = placeholderNode as ElementContent
    })
  }
}
```

**Required dependency installs** (these exist as transitive deps but must be added as direct dependencies):

```bash
pnpm add unist-util-visit
pnpm add -D @types/hast
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/services/markdown-html.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml server/services/markdown-html.ts server/services/markdown-html.test.ts
git commit -m "feat: enhance markdownToHtml with KaTeX rendering and mermaid extraction for EPUB"
```

---

## Chunk 4: Electron Mermaid Renderer Integration

### Task 5: Register mermaid renderer in Electron main process

**Files:**
- Modify: `electron/main.ts` (inside `app.whenReady()`, after the `file:save` IPC handler ~line 215)

This task wires up the offscreen BrowserWindow renderer. It cannot be unit-tested (requires Electron runtime) — it will be verified by the integration test in Chunk 5.

- [ ] **Step 1: Add the renderer registration**

In `electron/main.ts`, after the `file:save` IPC handler (after line 215), add the mermaid renderer registration. Use `createRequire` from `node:module` since this is an ESM module — `require.resolve` is not available. Use a temp HTML file instead of a data URL to avoid template literal injection issues with the large mermaid bundle:

```ts
// Register mermaid renderer for EPUB export
import { createRequire } from 'node:module'

// Add this import at the top of the file, then use inside app.whenReady():
const require = createRequire(import.meta.url)

const { setMermaidRenderer } = await import('../server/services/mermaid-renderer.js')
const { sanitizeMermaidChart } = await import('../src/lib/sanitize-mermaid.js')
const { mermaidInitConfig } = await import('../lib/mermaid-theme.js')

setMermaidRenderer(async (charts: string[]) => {
  if (charts.length === 0) return []

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  })

  try {
    // Write a temp HTML file that loads mermaid — safer than data URLs for large bundles
    const mermaidPath = require.resolve('mermaid/dist/mermaid.min.js')
    const { readFile: readFileAsync, writeFile: writeTmp, unlink } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const mermaidJs = await readFileAsync(mermaidPath, 'utf-8')

    const tmpHtml = join(dataDir, 'mermaid-renderer.html')
    await writeTmp(tmpHtml, `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>${mermaidJs}</script>
<script>
  mermaid.initialize(${JSON.stringify(mermaidInitConfig)});
</script>
</body></html>`, 'utf-8')

    await win.loadFile(tmpHtml)

    const results: string[] = []
    for (let i = 0; i < charts.length; i++) {
      const sanitized = sanitizeMermaidChart(charts[i])
      try {
        const svg: string = await Promise.race([
          win.webContents.executeJavaScript(`
            (async () => {
              const { svg } = await mermaid.render('epub-chart-${i}', ${JSON.stringify(sanitized)});
              return svg;
            })()
          `),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Mermaid render timeout')), 10_000)
          ),
        ])
        results.push(svg)
      } catch (err) {
        console.warn(`[mermaid-renderer] Chart ${i} failed:`, err)
        // Fallback: raw code block
        results.push(`<pre><code class="language-mermaid">${sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
      }
    }

    // Clean up temp file
    await unlink(tmpHtml).catch(() => {})

    return results
  } finally {
    win.destroy()
  }
})
```

**Important notes for the implementer:**
- Use `createRequire(import.meta.url)` for `require.resolve` — the project is ESM
- The `import { createRequire } from 'node:module'` goes at the top of `electron/main.ts` with other imports
- A temp HTML file is used instead of a data URL to avoid issues with backticks/template literals in the mermaid bundle
- Each chart gets a unique render ID (`epub-chart-0`, `epub-chart-1`, etc.)
- The 10-second timeout per chart prevents the export from hanging
- Failed charts fall back to `<pre><code>` blocks (raw mermaid source)
- The BrowserWindow is destroyed in `finally` regardless of success/failure

- [ ] **Step 2: Run all tests (non-Electron)**

Run: `npx vitest run`
Expected: All tests pass (this code isn't exercised in vitest — it requires Electron)

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: register Electron offscreen mermaid renderer for EPUB export"
```

---

## Chunk 5: EPUB Export Route Integration

### Task 6: Update EPUB export to use enhanced pipeline

**Files:**
- Modify: `server/routes/books.ts:1112-1165` (the fire-and-forget EPUB export block)

- [ ] **Step 1: Rewrite the EPUB export pipeline**

In `server/routes/books.ts`, replace the fire-and-forget block (lines 1112-1165). The new flow:

```ts
// Fire-and-forget
;(async () => {
  try {
    const { markdownToHtml } = await import('../services/markdown-html.js')
    const { renderMermaidCharts } = await import('../services/mermaid-renderer.js')
    const epub = (await import('epub-gen-memory')).default
    const { readFile: readFileAsync2 } = await import('node:fs/promises')
    const { createRequire } = await import('node:module')

    const toc = await store.getToc(bookId)

    // Phase 1: Convert all chapters (KaTeX renders inline, mermaid blocks become placeholders)
    const chapterResults: Array<{
      title: string
      html: string
      mermaidBlocks: Array<{ placeholder: string; source: string }>
    }> = []

    for (let i = 1; i <= meta.totalChapters; i++) {
      if (task.abortController.signal.aborted) return
      taskManager.updateProgress(task.id, i, `Converting chapter ${i} of ${meta.totalChapters}`)
      const md = await store.getChapter(bookId, i)
      const result = await markdownToHtml(md, { preserveSources: true })
      chapterResults.push({
        title: toc.chapters[i - 1]?.title ?? `Chapter ${i}`,
        ...result,
      })
    }

    if (task.abortController.signal.aborted) return

    // Phase 2: Batch render all mermaid diagrams
    const allMermaidSources = chapterResults.flatMap(ch =>
      ch.mermaidBlocks.map(b => b.source)
    )

    let allMermaidSvgs: string[] = []
    if (allMermaidSources.length > 0) {
      taskManager.updateProgress(task.id, meta.totalChapters, `Rendering ${allMermaidSources.length} diagram(s)...`)
      allMermaidSvgs = await renderMermaidCharts(allMermaidSources)
    }

    if (task.abortController.signal.aborted) return

    // Phase 3: Substitute mermaid SVGs into chapter HTML
    let svgIndex = 0
    const chapters: Array<{ title: string; content: string }> = chapterResults.map(ch => {
      let html = ch.html
      for (const block of ch.mermaidBlocks) {
        const svg = allMermaidSvgs[svgIndex]

        let renderedHtml: string
        if (svg && !svg.startsWith('<pre>')) {
          // Successfully rendered — wrap in container + hidden source
          renderedHtml =
            `<div class="tutor-mermaid-rendered">${svg}</div>` +
            `<div class="tutor-mermaid-source" style="display:none" data-tutor-type="mermaid">${block.source}</div>`
        } else {
          // Fallback (no renderer or render failed) — keep code block + hidden source
          const escaped = block.source.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          renderedHtml =
            `<pre><code class="language-mermaid">${escaped}</code></pre>` +
            `<div class="tutor-mermaid-source" style="display:none" data-tutor-type="mermaid">${block.source}</div>`
        }

        // Replace the placeholder div with the rendered content
        html = html.replace(
          new RegExp(`<div[^>]*>${block.placeholder}</div>`),
          renderedHtml
        )
        svgIndex++
      }
      return { title: ch.title, content: html }
    })

    if (task.abortController.signal.aborted) return

    taskManager.updateProgress(task.id, meta.totalChapters, 'Assembling EPUB...')

    // Build epub options
    const epubOptions: {
      title: string
      author: string
      cover?: string
      css?: string
    } = {
      title: meta.title + (meta.subtitle ? `: ${meta.subtitle}` : ''),
      author: 'Tutor',
    }

    // Inline KaTeX CSS if any chapter has math
    const hasMath = chapterResults.some(ch => ch.html.includes('class="katex"'))
    if (hasMath) {
      try {
        const esmRequire = createRequire(import.meta.url)
        const katexCssPath = esmRequire.resolve('katex/dist/katex.min.css')
        epubOptions.css = await readFileAsync2(katexCssPath, 'utf-8')
      } catch {
        console.warn('[epub-export] Could not load KaTeX CSS')
      }
    }

    // Add cover if exists
    const coverPath = await store.getCoverPath(bookId)
    if (coverPath) {
      const { pathToFileURL } = await import('node:url')
      epubOptions.cover = pathToFileURL(coverPath).href
    }

    const epubBuffer = await epub(epubOptions, chapters)
    const { writeFile: writeFileAsync, rename: renameAsync } = await import('node:fs/promises')
    const epubDest = store.epubPath(bookId)
    const tmp = epubDest + '.tmp'
    await writeFileAsync(tmp, epubBuffer)
    await renameAsync(tmp, epubDest)

    taskManager.completeTask(task.id, { path: `/api/books/${bookId}/export-epub` })
  } catch (err) {
    if (task.abortController.signal.aborted) return
    taskManager.failTask(task.id, err instanceof Error ? err.message : 'EPUB export failed')
  }
})()
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Integration test — export EPUB with mermaid + KaTeX**

Run: `pnpm electron:dev`

1. Open a book with known mermaid diagrams (e.g., `8e077f7f-45c` chapter 01)
2. Right-click the book → Export EPUB
3. Wait for background task to complete
4. Open the EPUB in an EPUB reader (e.g., Books.app on macOS)
5. Verify:
   - Mermaid diagrams appear as SVG images (not raw code blocks)
   - KaTeX math renders properly (if the book has any)
   - General text formatting is preserved
6. Inspect the EPUB HTML (rename `.epub` to `.zip`, extract, open chapter XHTML):
   - Confirm `data-tutor-type="mermaid"` hidden divs exist with raw source
   - Confirm `data-tutor-type="katex-inline"` / `katex-display` hidden spans exist (if applicable)

- [ ] **Step 4: Commit**

```bash
git add server/routes/books.ts
git commit -m "feat: EPUB export renders mermaid diagrams and KaTeX with source preservation"
```
