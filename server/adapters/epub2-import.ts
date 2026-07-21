import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EPub_ from 'epub2'
import TurndownService from 'turndown'
import type { EpubPreview } from '@shared/responses.js'
import type { EpubImport, ImportedBook, ImportedChapter, ImportedCover } from '../ports/epub-import.js'

/**
 * Implements the EpubImport port in server/ports/epub-import.ts, backed by
 * the real epub2 parser and Turndown for HTML-to-markdown conversion.
 * Parsing logic lifted from server/services/epub-importer.ts. Unlike that
 * module, preview() and read() write nothing beyond the scratch file
 * epub2's own API requires. It can only parse from a path, never a Buffer
 * directly, so every call writes the input bytes to a temp file first and
 * always removes it afterward, even when parsing throws.
 *
 * A file that is encrypted or DRM-protected is rejected with a message
 * naming that specifically, rather than the generic parse-failure message
 * any other malformed EPUB gets.
 */
// epub2's default export is the module namespace; the actual class is on .default
const EPub = (EPub_ as unknown as { default: typeof EPub_ }).default ?? EPub_

type EPubInstance = InstanceType<typeof EPub>

/**
 * Constructor override for createEpub2Import. tmpDir is the only field,
 * overridden in tests so the scratch parse file lands in a directory the
 * test controls and cleans up itself.
 */
export interface Epub2ImportDeps {
  /** Directory for the scratch file epub2 needs to parse from. Defaults to the OS temp dir. */
  tmpDir?: () => string
}

/**
 * Factory for the EpubImport port, backed by the real epub2 parser and
 * Turndown for HTML-to-markdown conversion. Parsing logic lifted from
 * server/services/epub-importer.ts; unlike that module, preview() and
 * read() write nothing beyond the scratch file epub2's own API requires
 * (it can only parse from a path, never a Buffer directly).
 */
export function createEpub2Import(deps: Epub2ImportDeps = {}): EpubImport {
  const tmpDir = deps.tmpDir ?? tmpdir

  /** Write buffer to a scratch temp file so epub2 can parse it, cleaning up on failure. */
  async function parseEpub(buffer: Buffer): Promise<EPubInstance> {
    const tmpPath = join(tmpDir(), `tutor-epub-${randomUUID()}.epub`)
    await writeFile(tmpPath, buffer)
    try {
      const epub = await EPub.createAsync(tmpPath)
      tmpPaths.set(epub, tmpPath)
      return epub
    } catch (err: unknown) {
      await unlink(tmpPath).catch(() => {})
      const message = err instanceof Error ? err.message : 'unknown error'
      if (message.includes('encrypted') || message.includes('DRM')) {
        throw new Error('DRM-protected EPUBs cannot be imported', { cause: err })
      }
      throw new Error(`Failed to parse EPUB: ${message}`, { cause: err })
    }
  }

  async function cleanupEpub(epub: EPubInstance): Promise<void> {
    const tmpPath = tmpPaths.get(epub)
    if (tmpPath) {
      tmpPaths.delete(epub)
      await unlink(tmpPath).catch(() => {})
    }
  }

  return {
    async preview(buffer: Buffer): Promise<EpubPreview> {
      const epub = await parseEpub(buffer)
      try {
        const title = epub.metadata?.title ?? 'Untitled'
        const subtitle = epub.metadata?.description || undefined

        // Count chapters from the spine, excluding TOC/nav pages. Mirrors
        // isTocPage's id/href checks but, unlike it, also excludes items
        // with no id at all (read() never reaches this filter, because it
        // already skips id-less spine items before calling isTocPage).
        const chapterCount = (epub.flow ?? []).filter((item: { id?: string; href?: string }) => {
          if (!item.id) return false
          return !isTocPage(item, '')
        }).length

        const cover = await extractCover(epub)
        const hasCover = cover !== null
        const coverBase64 = cover ? `data:${cover.mediaType};base64,${cover.data.toString('base64')}` : undefined

        return { title, subtitle, chapterCount, hasCover, coverBase64 }
      } finally {
        await cleanupEpub(epub)
      }
    },

    async read(buffer: Buffer): Promise<ImportedBook> {
      const epub = await parseEpub(buffer)
      try {
        const rawTitle = epub.metadata?.title ?? 'Untitled'

        // Configure Turndown for HTML-to-Markdown conversion
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
          emDelimiter: '*',
          strongDelimiter: '**',
        })

        // Recover raw mermaid/KaTeX source from Tutor-exported hidden elements
        addTutorSourceRules(turndown)

        // Extract chapters in spine order
        const chapters: ImportedChapter[] = []
        let bookLevelMeta: Record<string, unknown> = {}

        for (let i = 0; i < epub.flow.length; i++) {
          const spineItem = epub.flow[i]
          if (!spineItem.id) continue

          try {
            const rawHtml = await epub.getChapterAsync(spineItem.id)

            // Skip TOC / navigation pages (epub generators include these in the spine)
            if (isTocPage(spineItem, rawHtml || '')) continue

            // Extract Tutor round-trip metadata before markdown conversion
            const { description, bookMeta, html } = extractTutorMeta(rawHtml || '')
            if (bookMeta && chapters.length === 0) {
              bookLevelMeta = bookMeta
            }

            const markdown = turndown.turndown(html)

            // Only include chapters with meaningful content
            if (markdown.trim().length < 10) continue

            // Find matching TOC entry for title
            const tocEntry = epub.toc?.find((t: { id?: string }) => t.id === spineItem.id)
            const rawChapterTitle = tocEntry?.title || spineItem.title || `Chapter ${chapters.length + 1}`
            const title = stripNumericPrefix(rawChapterTitle)

            chapters.push({ title, description: description || '', markdown })
          } catch {
            // Skip chapters that can't be read
          }
        }

        if (chapters.length === 0) {
          throw new Error('No readable chapters found in EPUB')
        }

        // Split title/subtitle: prefer embedded metadata, fall back to splitting "Title: Subtitle"
        let title = rawTitle
        let subtitle: string | undefined
        if (typeof bookLevelMeta.subtitle === 'string') {
          subtitle = bookLevelMeta.subtitle
          // Strip the subtitle suffix the exporter appended to dc:title
          const suffix = `: ${subtitle}`
          if (title.endsWith(suffix)) {
            title = title.slice(0, -suffix.length)
          }
        }

        const cover = await extractCover(epub)

        return {
          meta: {
            title,
            ...(subtitle ? { subtitle } : {}),
            ...(typeof bookLevelMeta.showTitleOnCover === 'boolean'
              ? { showTitleOnCover: bookLevelMeta.showTitleOnCover }
              : {}),
          },
          chapters,
          ...(cover ? { cover } : {}),
        }
      } finally {
        await cleanupEpub(epub)
      }
    },
  }
}

// Map to track temp file paths for cleanup. Module-scope so createEpub2Import
// can be called more than once without each instance losing track of the
// other's in-flight parses; keyed by epub instance, so this is safe across
// concurrent preview()/read() calls.
const tmpPaths = new WeakMap<EPubInstance, string>()

/** Extract cover image from epub if available */
async function extractCover(epub: EPubInstance): Promise<ImportedCover | null> {
  try {
    const coverId = epub.metadata?.cover
    if (!coverId) return null

    const [data, mimeType] = await epub.getImageAsync(coverId)
    if (data && data.length > 0) {
      return { data: Buffer.from(data as unknown as Buffer), mediaType: mimeType as unknown as string }
    }
  } catch {
    // Cover extraction is best-effort
  }
  return null
}

/** Decode basic HTML entities. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Extract Tutor round-trip metadata embedded as hidden divs during export.
 * Returns the extracted values and the HTML with those divs removed.
 */
function extractTutorMeta(html: string): {
  description?: string
  bookMeta?: Record<string, unknown>
  html: string
} {
  let description: string | undefined
  let bookMeta: Record<string, unknown> | undefined
  let cleaned = html

  const descRe = /<div[^>]*class="tutor-chapter-description"[^>]*>([\s\S]*?)<\/div>/
  const descMatch = cleaned.match(descRe)
  if (descMatch) {
    description = decodeHtmlEntities(descMatch[1].trim())
    cleaned = cleaned.replace(descMatch[0], '')
  }

  const metaRe = /<div[^>]*class="tutor-book-meta"[^>]*>([\s\S]*?)<\/div>/
  const metaMatch = cleaned.match(metaRe)
  if (metaMatch) {
    try {
      bookMeta = JSON.parse(decodeHtmlEntities(metaMatch[1].trim()))
    } catch { /* not valid JSON — ignore */ }
    cleaned = cleaned.replace(metaMatch[0], '')
  }

  return { description, bookMeta, html: cleaned }
}

/** Detect TOC / navigation pages that epub generators include in the spine. */
function isTocPage(spineItem: { id?: string; href?: string }, html: string): boolean {
  const id = spineItem.id?.toLowerCase() ?? ''
  const href = spineItem.href?.toLowerCase() ?? ''
  if (id === 'toc' || id === 'nav') return true
  if (href.includes('toc.xhtml') || href.includes('nav.xhtml')) return true
  // EPUB3 navigation document
  if (html.includes('epub:type="toc"')) return true
  return false
}

/** Strip leading numeric prefixes like "1. ", "01. " added by epub generators. */
function stripNumericPrefix(title: string): string {
  return title.replace(/^\d+\.\s+/, '')
}

/**
 * Add Turndown rules that recover raw mermaid/KaTeX source from Tutor-exported
 * hidden elements (identified by class name), reconstructing the original markdown.
 * For non-Tutor EPUBs these rules simply never match.
 *
 * Note: epub-gen-memory strips data-* attributes from XHTML output, so all
 * Tutor metadata uses class names for identification.
 */
function addTutorSourceRules(turndown: TurndownService): void {
  const hasClass = (node: Node, cls: string) =>
    (node as HTMLElement).classList?.contains?.(cls) === true

  // Hidden mermaid source → ```mermaid code block
  turndown.addRule('tutor-mermaid-source', {
    filter: (node) => hasClass(node, 'tutor-mermaid-source'),
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `\n\n\`\`\`mermaid\n${raw}\n\`\`\`\n\n`
    },
  })

  // Hidden inline KaTeX source → $...$
  turndown.addRule('tutor-katex-inline', {
    filter: (node) => hasClass(node, 'tutor-katex-inline'),
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `$${raw}$`
    },
  })

  // Hidden display KaTeX source → $$...$$
  turndown.addRule('tutor-katex-display', {
    filter: (node) => hasClass(node, 'tutor-katex-display'),
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `\n\n$$\n${raw}\n$$\n\n`
    },
  })

  // Remove rendered mermaid SVG containers (the source div handles reconstruction)
  turndown.addRule('tutor-mermaid-rendered', {
    filter: (node) => hasClass(node, 'tutor-mermaid-rendered'),
    replacement: () => '',
  })

  // Remove rendered KaTeX output (the source element handles reconstruction)
  turndown.addRule('tutor-katex-rendered', {
    filter: (node) => {
      const classes = (node as HTMLElement).classList
      if (!classes) return false
      return classes.contains('katex') || classes.contains('katex-display')
    },
    replacement: () => '',
  })
}
