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

#### Shared mermaid theme (`lib/mermaid-theme.ts`)

The OKLCH palette, `themeCSS`, and `themeVariables` are currently defined inline in `src/components/MermaidDiagram.tsx` (~100 lines). Extract these into `lib/mermaid-theme.ts` — a shared module importable by both the frontend component and the Electron renderer. This avoids duplication and keeps the EPUB diagrams visually consistent with the in-app reader.

#### Mermaid sanitization

Before rendering, each chart source is passed through `sanitizeMermaidChart()` (from `src/lib/sanitize-mermaid.ts`) to strip `style`/`classDef`/`class` directives that would override the OKLCH theme. This is the same sanitization the frontend applies. Since the server-side renderer needs this, the function stays in `src/lib/` (already accessible to the server via the existing path aliases).

#### Electron integration (`electron/main.ts`)

After app ready, calls `setMermaidRenderer()` with a function that:
1. Creates a hidden `BrowserWindow` (`show: false`, `offscreen: true`)
2. Loads a minimal inline HTML page with mermaid initialized using the shared theme from `lib/mermaid-theme.ts`
3. For each chart source, calls `webContents.executeJavaScript()` to run `mermaid.render(id, source)` and collect the SVG string. Each call has a 10-second timeout — if a chart hangs, it falls back to a raw `<pre><code>` block for that chart and continues with the rest.
4. Closes the window
5. Returns the array of SVG strings (or fallback HTML for failed charts)

The window is created once per export batch, reused for all charts, then destroyed.

#### Per-chart error handling

If an individual chart fails to render (invalid syntax, timeout, mermaid error), the renderer returns a fallback `<pre><code class="language-mermaid">` block for that chart — the same as the no-renderer case. The hidden source div is still emitted so round-trip import works regardless. The export continues; one bad chart does not abort the batch.

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

The function uses overloaded signatures to maintain backward compatibility:

```ts
interface MarkdownToHtmlResult {
  html: string
  mermaidBlocks: Array<{ placeholder: string; source: string }>
}

// Existing call sites — returns plain string, no behavior change
function markdownToHtml(md: string): Promise<string>

// EPUB export — returns result object with mermaid extraction
function markdownToHtml(md: string, opts: {
  preserveSources: true
}): Promise<MarkdownToHtmlResult>
```

- No options (default) — returns `Promise<string>` as today. KaTeX and mermaid are not processed. Existing call sites require zero changes.
- `preserveSources: true` (EPUB export) — returns `Promise<MarkdownToHtmlResult>`. Adds remark-math + rehype-katex with source preservation divs, extracts mermaid code blocks as placeholders for external rendering.

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

### EPUB cache invalidation

The current export route caches the EPUB at `books/{id}/book.epub` and returns it on subsequent requests. When the rendering pipeline changes (this feature), stale cached EPUBs would not include rendered diagrams/math. The EPUB export route already deletes the cached EPUB when a book's content changes (chapter regeneration). For the pipeline upgrade, no special cache invalidation is needed — users who want re-rendered EPUBs simply re-export (the POST endpoint already regenerates when no cache exists). If a cached EPUB exists and the user wants the new rendering, they delete and re-export via the UI.

### File Changes

| File | Change |
|------|--------|
| `lib/mermaid-theme.ts` | **New.** Shared mermaid theme config (extracted from `MermaidDiagram.tsx`) |
| `server/services/markdown-html.ts` | Add remark-math, rehype-katex, custom rehype plugins for source preservation + mermaid extraction; overloaded signatures |
| `server/services/mermaid-renderer.ts` | **New.** Injectable mermaid rendering service with per-chart error handling |
| `electron/main.ts` | Register mermaid renderer after app ready |
| `server/routes/books.ts` | Update EPUB export route to use enhanced pipeline + batch mermaid rendering |
| `src/components/MermaidDiagram.tsx` | Import theme from `lib/mermaid-theme.ts` instead of inline definition |

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
