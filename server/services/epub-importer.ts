import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EPub_ from 'epub2'
// epub2's default export is the module namespace; the actual class is on .default
const EPub = (EPub_ as unknown as { default: typeof EPub_ }).default ?? EPub_
import TurndownService from 'turndown'
import type { BookMeta } from '../schemas.js'
import { saveBook, saveToc, saveChapter, saveCover } from './book-store.js'

export interface EpubPreview {
  title: string
  subtitle?: string
  chapterCount: number
  hasCover: boolean
  coverBase64?: string
}

type EPubInstance = InstanceType<typeof EPub>

// Map to track temp file paths for cleanup
const tmpPaths = new WeakMap<EPubInstance, string>()

/** Write buffer to a temp file, parse with epub2, and clean up */
async function parseEpub(buffer: Buffer): Promise<EPubInstance> {
  const tmpPath = join(tmpdir(), `tutor-epub-${randomUUID()}.epub`)
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

/** Extract cover image from epub if available */
async function extractCover(epub: EPubInstance): Promise<{ data: Buffer; mediaType: string } | null> {
  try {
    const coverId = epub.metadata?.cover
    if (!coverId) return null

    const [data, mimeType] = await epub.getImageAsync(coverId)
    if (data && data.length > 0) {
      return { data: data as unknown as Buffer, mediaType: mimeType as unknown as string }
    }
  } catch {
    // Cover extraction is best-effort
  }
  return null
}

/**
 * Preview an EPUB file — extract metadata only without full chapter content.
 */
export async function previewEpub(buffer: Buffer): Promise<EpubPreview> {
  const epub = await parseEpub(buffer)
  try {
    const title = epub.metadata?.title ?? 'Untitled'
    const subtitle = epub.metadata?.description || undefined

    // Count chapters from the spine, excluding TOC/nav pages
    const chapterCount = (epub.flow ?? []).filter((item: { id?: string; href?: string }) => {
      if (!item.id) return false
      const id = item.id.toLowerCase()
      const href = (item.href ?? '').toLowerCase()
      return id !== 'toc' && id !== 'nav' && !href.includes('toc.xhtml') && !href.includes('nav.xhtml')
    }).length

    // Try to get cover
    const cover = await extractCover(epub)
    const hasCover = cover !== null
    const coverBase64 = cover ? `data:${cover.mediaType};base64,${cover.data.toString('base64')}` : undefined

    return { title, subtitle, chapterCount, hasCover, coverBase64 }
  } finally {
    await cleanupEpub(epub)
  }
}

/**
 * Import an EPUB file — full conversion to a Tutor book.
 */
export async function importEpub(
  buffer: Buffer,
  options?: { tags?: string[]; series?: string; seriesOrder?: number },
): Promise<BookMeta> {
  const epub = await parseEpub(buffer)
  try {
    const rawTitle = epub.metadata?.title ?? 'Untitled'
    const bookId = randomUUID()
    const now = new Date().toISOString()

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
    const chapterContents: string[] = []
    const tocChapters: Array<{ title: string; description: string }> = []
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
        if (bookMeta && chapterContents.length === 0) {
          bookLevelMeta = bookMeta
        }

        const markdown = turndown.turndown(html)

        // Only include chapters with meaningful content
        if (markdown.trim().length < 10) continue

        chapterContents.push(markdown)

        // Find matching TOC entry for title
        const tocEntry = epub.toc?.find((t: { id?: string }) => t.id === spineItem.id)
        const rawTitle = tocEntry?.title || spineItem.title || `Chapter ${chapterContents.length}`
        const chapterTitle = stripNumericPrefix(rawTitle)

        tocChapters.push({
          title: chapterTitle,
          description: description || '',
        })
      } catch {
        // Skip chapters that can't be read
      }
    }

    if (chapterContents.length === 0) {
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

    // Create the book metadata
    const meta: BookMeta = {
      id: bookId,
      title,
      ...(subtitle ? { subtitle } : {}),
      prompt: 'Imported from EPUB',
      status: 'reading',
      totalChapters: chapterContents.length,
      generatedUpTo: chapterContents.length,
      createdAt: now,
      updatedAt: now,
      imported: true,
      ...(typeof bookLevelMeta.showTitleOnCover === 'boolean'
        ? { showTitleOnCover: bookLevelMeta.showTitleOnCover }
        : {}),
      tags: options?.tags ?? [],
      ...(options?.series ? { series: options.series } : {}),
      ...(options?.seriesOrder ? { seriesOrder: options.seriesOrder } : {}),
    }

    // Save book meta (also creates directories)
    await saveBook(meta)

    // Save TOC
    await saveToc(bookId, { chapters: tocChapters })

    // Save each chapter
    for (let i = 0; i < chapterContents.length; i++) {
      await saveChapter(bookId, i + 1, chapterContents[i])
    }

    // Extract and save cover if present
    const cover = await extractCover(epub)
    if (cover) {
      await saveCover(bookId, cover.data, cover.mediaType)
    }

    return meta
  } finally {
    await cleanupEpub(epub)
  }
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
