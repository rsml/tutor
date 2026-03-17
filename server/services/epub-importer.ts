import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EPub from 'epub2'
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

// Map to track temp file paths for cleanup
const tmpPaths = new WeakMap<EPub, string>()

/** Write buffer to a temp file, parse with epub2, and clean up */
async function parseEpub(buffer: Buffer): Promise<EPub> {
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

async function cleanupEpub(epub: EPub): Promise<void> {
  const tmpPath = tmpPaths.get(epub)
  if (tmpPath) {
    tmpPaths.delete(epub)
    await unlink(tmpPath).catch(() => {})
  }
}

/** Extract cover image from epub if available */
async function extractCover(epub: EPub): Promise<{ data: Buffer; mediaType: string } | null> {
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

    // Count chapters from the spine (flow)
    const chapterCount = epub.flow?.length ?? 0

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
    const title = epub.metadata?.title ?? 'Untitled'
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

    for (let i = 0; i < epub.flow.length; i++) {
      const spineItem = epub.flow[i]
      if (!spineItem.id) continue

      try {
        const html = await epub.getChapterAsync(spineItem.id)
        const markdown = turndown.turndown(html || '')

        // Only include chapters with meaningful content
        if (markdown.trim().length < 10) continue

        chapterContents.push(markdown)

        // Find matching TOC entry for title
        const tocEntry = epub.toc?.find((t) => t.id === spineItem.id)
        const chapterTitle = tocEntry?.title || spineItem.title || `Chapter ${chapterContents.length}`

        tocChapters.push({
          title: chapterTitle,
          description: '',
        })
      } catch {
        // Skip chapters that can't be read
      }
    }

    if (chapterContents.length === 0) {
      throw new Error('No readable chapters found in EPUB')
    }

    // Create the book metadata
    const meta: BookMeta = {
      id: bookId,
      title,
      prompt: 'Imported from EPUB',
      status: 'reading',
      totalChapters: chapterContents.length,
      generatedUpTo: chapterContents.length,
      createdAt: now,
      updatedAt: now,
      imported: true,
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

/**
 * Add Turndown rules that recover raw mermaid/KaTeX source from Tutor-exported
 * hidden elements (`data-tutor-type`), reconstructing the original markdown.
 * For non-Tutor EPUBs these rules simply never match.
 */
function addTutorSourceRules(turndown: TurndownService): void {
  // Hidden mermaid source → ```mermaid code block
  turndown.addRule('tutor-mermaid-source', {
    filter: (node) =>
      node.getAttribute?.('data-tutor-type') === 'mermaid',
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `\n\n\`\`\`mermaid\n${raw}\n\`\`\`\n\n`
    },
  })

  // Hidden inline KaTeX source → $...$
  turndown.addRule('tutor-katex-inline', {
    filter: (node) =>
      node.getAttribute?.('data-tutor-type') === 'katex-inline',
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `$${raw}$`
    },
  })

  // Hidden display KaTeX source → $$...$$
  turndown.addRule('tutor-katex-display', {
    filter: (node) =>
      node.getAttribute?.('data-tutor-type') === 'katex-display',
    replacement: (_content, node) => {
      const raw = (node as HTMLElement).textContent ?? ''
      return `\n\n$$\n${raw}\n$$\n\n`
    },
  })

  // Remove rendered mermaid SVG containers (the source div handles reconstruction)
  turndown.addRule('tutor-mermaid-rendered', {
    filter: (node) =>
      (node as HTMLElement).classList?.contains?.('tutor-mermaid-rendered') === true,
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
