# EPUB Mermaid & KaTeX Rendering with Round-Trip Source Preservation

## Problem

EPUB export converts chapter markdown to HTML using a bare-bones remark/rehype pipeline (`server/services/markdown-html.ts`). Mermaid diagrams export as raw code blocks and KaTeX math exports as raw LaTeX — neither renders in EPUB readers.

## Goal

Render mermaid diagrams as SVG and KaTeX as styled HTML in exported EPUBs, while embedding the raw source in hidden elements so a future EPUB import can recover the original markdown.

## Approach: Hidden Sibling Elements

Each rendered mermaid/KaTeX block gets a hidden sibling `<div>`/`<span>` containing the raw source text, marked with a `data-tutor-type` attribute. EPUB readers ignore these (they're `display:none`). On import, a parser finds `[data-tutor-type]` elements and reconstructs markdown.

## Design

### KaTeX Rendering

KaTeX works server-side natively — no DOM required. Add `remark-math` + `rehype-katex` to the server's unified pipeline (both packages are already installed).

**Source preservation:** A custom rehype plugin runs after `rehype-katex`. It walks the HAST tree, finds KaTeX output nodes, and wraps each in a pair: the rendered output plus a hidden sibling with the raw source.

```html
<!-- Inline math -->
<span class="tutor-katex-rendered"><span class="katex">...</span></span>
<span class="tutor-katex-source" style="display:none" data-tutor-type="katex-inline">E = mc^2</span>

<!-- Display math -->
<div class="tutor-katex-rendered"><span class="katex-display">...</span></div>
<div class="tutor-katex-source" style="display:none" data-tutor-type="katex-display">\int_0^\infty x^2 dx</div>
```

**KaTeX CSS:** Inlined once at the book level using `epub-gen-memory`'s `css` option, not duplicated per chapter.

### Mermaid Rendering

Mermaid requires a real DOM. Since the Fastify server runs inside Electron's main process, we use a hidden `BrowserWindow` to render.

#### Mermaid renderer service (`server/services/mermaid-renderer.ts`)

Exports:
- `setMermaidRenderer(fn: (charts: string[]) => Promise<string[]>): void` — called by `electron/main.ts` to inject the Electron-based renderer
- `renderMermaidCharts(charts: string[]): Promise<string[]>` — returns SVG strings; falls back to empty array if no renderer is set (standalone server mode)

#### Electron integration (`electron/main.ts`)

After app ready, calls `setMermaidRenderer()` with a function that:
1. Creates a hidden `BrowserWindow` (`show: false`, `offscreen: true`)
2. Loads a minimal inline HTML page with mermaid initialized (same OKLCH dark-mode theme as `MermaidDiagram.tsx`)
3. For each chart source, calls `webContents.executeJavaScript()` to run `mermaid.render(id, source)` and collect the SVG string
4. Closes the window
5. Returns the array of SVG strings

The window is created once per export batch, reused for all charts, then destroyed.

#### Source preservation

Same hidden-sibling pattern as KaTeX:

```html
<div class="tutor-mermaid-rendered">
  <svg>...rendered diagram...</svg>
</div>
<div class="tutor-mermaid-source" style="display:none" data-tutor-type="mermaid">
graph TD
  A["Start"] --> B["End"]
</div>
```

#### Standalone server fallback

When no renderer is registered (running `pnpm dev:server` outside Electron), mermaid code blocks stay as `<pre><code class="language-mermaid">` — the current behavior. A log warning is emitted once.

### Enhanced `markdownToHtml()`

The function signature changes to support EPUB-specific behavior:

```ts
interface MarkdownToHtmlResult {
  html: string
  mermaidBlocks: Array<{ placeholder: string; source: string }>
}

function markdownToHtml(md: string, opts?: {
  preserveSources?: boolean
}): Promise<MarkdownToHtmlResult>
```

- `preserveSources: false` (default) — current behavior, returns `{ html, mermaidBlocks: [] }`
- `preserveSources: true` (EPUB export) — adds KaTeX source preservation divs, extracts mermaid code blocks as placeholders for external rendering, returns the mermaid sources for batch rendering

### EPUB Export Pipeline Changes (`server/routes/books.ts`)

Current flow:
```
for each chapter: md → markdownToHtml(md) → push to chapters[]
```

New flow:
1. **Convert all chapters** with `markdownToHtml(md, { preserveSources: true })` — KaTeX renders inline, mermaid blocks become placeholders
2. **Collect all mermaid sources** across all chapters
3. **Batch render** via `renderMermaidCharts(allSources)` — one offscreen BrowserWindow session
4. **Substitute** mermaid SVGs + hidden source divs back into each chapter's HTML
5. **Assemble EPUB** with KaTeX CSS inlined at the book level

### File Changes

| File | Change |
|------|--------|
| `server/services/markdown-html.ts` | Add remark-math, rehype-katex, custom rehype plugins for source preservation + mermaid extraction |
| `server/services/mermaid-renderer.ts` | **New.** Injectable mermaid rendering service |
| `electron/main.ts` | Register mermaid renderer after app ready |
| `server/routes/books.ts` | Update EPUB export route to use enhanced pipeline + batch mermaid rendering |

### New dependencies

None. All packages (`mermaid`, `katex`, `remark-math`, `rehype-katex`) are already installed.

## Phase 2: EPUB Import (Future)

When importing a Tutor-exported EPUB:
1. Parse each chapter's HTML with a DOM parser (e.g., `cheerio` or HAST utilities)
2. Find all `[data-tutor-type]` elements
3. For `mermaid`: replace the rendered+source div pair with ` ```mermaid\n{source}\n``` `
4. For `katex-inline`: replace with `$source$`
5. For `katex-display`: replace with `$$source$$`
6. Convert remaining HTML back to markdown (e.g., `rehype-remark` + `remark-stringify`)
7. Result: clean markdown chapters ready to create a new book

The hidden-div convention makes this extraction trivial — no heuristic parsing of rendered output needed.

## Testing

- **`markdownToHtml` unit tests:** verify KaTeX renders with source preservation, mermaid blocks extract as placeholders, default mode unchanged
- **`mermaid-renderer` unit tests:** verify `setMermaidRenderer`/`renderMermaidCharts` contract, fallback when no renderer set
- **Rehype plugin tests:** verify hidden source divs have correct `data-tutor-type`, `style="display:none"`, and accurate raw source content
- **Integration:** export an EPUB from a book with mermaid + KaTeX, open in an EPUB reader, verify diagrams and math render; inspect HTML to confirm hidden source divs present
