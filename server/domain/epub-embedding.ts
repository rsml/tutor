/**
 * Hidden-div round-trip markup embedded in exported EPUB chapter HTML, read
 * back by the importer (server/adapters/epub2-import.ts's addTutorSourceRules
 * and extractTutorMeta) to recover mermaid sources, per-chapter descriptions,
 * and book-level metadata that plain EPUB HTML has no other room for.
 *
 * Pure string transforms only, no I/O, no ports. Lifted from the inline
 * substitution logic that used to live in the POST /api/books/:id/export-epub
 * route handler; server/services/export-epub.ts is the only caller.
 */

/**
 * Escapes &, <, and > for embedding inside a hidden div's text content.
 *
 * Deliberately distinct from ports/diagram-renderer.ts's diagramSourceFallback,
 * which only escapes < and > and never &. The two must not be unified
 * without also changing visible output for a chart source that contains a
 * literal &, see renderMermaidBlockHtml's own comment below for where that
 * distinction actually matters.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Builds the substitution HTML for one mermaid block: either the rendered
 * SVG wrapped for display, or a readable `<pre><code>` fallback, plus a
 * hidden `tutor-mermaid-source` div carrying the raw chart source so the
 * importer can always recover it, rendered or not.
 *
 * `svg` is treated as "not really rendered" whenever it is falsy or starts
 * with `<pre>`. Both are live cases: an empty string is what the old
 * DiagramRenderer contract returned for a failed chart, and a `<pre>`-prefixed
 * string is what the current contract's diagramSourceFallback always
 * returns instead. Either way this function takes the same fallback branch,
 * which rebuilds its own `<pre><code>` block from the escaped source rather
 * than reusing `svg` verbatim. That duplication is deliberate: this
 * module's escapeHtml also escapes &, diagramSourceFallback does not, so
 * reusing the port's own fallback string here would silently change visible
 * output for a chart source containing a literal &.
 */
export function renderMermaidBlockHtml(source: string, svg: string | undefined): string {
  const escapedSource = escapeHtml(source)
  const sourceDiv = `<div class="tutor-mermaid-source" style="display:none">${escapedSource}</div>`

  if (svg && !svg.startsWith('<pre>')) {
    return `<div class="tutor-mermaid-rendered">${svg}</div>${sourceDiv}`
  }
  return `<pre><code class="language-mermaid">${escapedSource}</code></pre>${sourceDiv}`
}

/** Replaces a mermaid placeholder div (see server/services/markdown-html.ts) in `html` with its rendered substitution. */
export function substituteMermaidPlaceholder(html: string, placeholder: string, renderedHtml: string): string {
  return html.replace(new RegExp(`<div[^>]*>${placeholder}</div>`), renderedHtml)
}

/**
 * Prepends a hidden `tutor-chapter-description` div carrying the chapter's
 * TOC description, for the importer to recover it. A blank description
 * embeds nothing, matching the exporter's original behaviour.
 */
export function embedChapterDescription(html: string, description: string): string {
  if (!description) return html
  return `<div class="tutor-chapter-description" style="display:none">${escapeHtml(description)}</div>\n${html}`
}

export interface BookMetaForEmbedding {
  showTitleOnCover?: boolean
  subtitle?: string
}

/**
 * Prepends a hidden `tutor-book-meta` div, JSON-encoding whichever of
 * showTitleOnCover and subtitle are set, to the first chapter's HTML. Plain
 * EPUB metadata has no room for either field, so the importer recovers them
 * from here instead. Embeds nothing when neither field is set.
 */
export function embedBookMeta(html: string, meta: BookMetaForEmbedding): string {
  const tutorMeta: Record<string, unknown> = {}
  if (meta.showTitleOnCover !== undefined) tutorMeta.showTitleOnCover = meta.showTitleOnCover
  if (meta.subtitle) tutorMeta.subtitle = meta.subtitle
  if (Object.keys(tutorMeta).length === 0) return html
  return `<div class="tutor-book-meta" style="display:none">${escapeHtml(JSON.stringify(tutorMeta))}</div>\n${html}`
}
