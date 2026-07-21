import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { BookMeta } from '@shared/domain.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore } from '../ports/artifact-store.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { DiagramRenderer } from '../ports/diagram-renderer.js'
import type { EpubExport, EpubExportChapter } from '../ports/epub-export.js'
import { markdownToHtml } from './markdown-html.js'
import {
  renderMermaidBlockHtml,
  substituteMermaidPlaceholder,
  embedChapterDescription,
  embedBookMeta,
} from '../domain/epub-embedding.js'

/**
 * Generates (POST) and downloads (GET) a book's exported EPUB. Extracted
 * from the inline generation logic in the POST /api/books/:id/export-epub
 * route handler; the route itself becomes wiring, translating
 * ExportEpubResult into an HTTP response.
 *
 * Pure hidden-div embedding lives in ../domain/epub-embedding.ts. Everything
 * else here is orchestration: gating, chapter-to-HTML conversion, batching
 * mermaid diagrams through DiagramRenderer, and handing the assembled
 * chapters to EpubExport.
 */

export interface ExportEpubDeps {
  bookRepository: Pick<BookRepository, 'getBook' | 'getToc' | 'getChapter'>
  artifactStore: Pick<ArtifactStore, 'epubExists' | 'writeEpub' | 'epubPath' | 'getCoverPath'>
  backgroundTasks: BackgroundTasks
  diagramRenderer: DiagramRenderer
  epubExport: EpubExport
}

export type ExportEpubResult =
  | { outcome: 'not-complete' }
  | { outcome: 'cached'; path: string }
  | { outcome: 'in-progress' }
  | { outcome: 'started'; taskId: string }

interface ChapterHtml {
  title: string
  html: string
  mermaidBlocks: Array<{ placeholder: string; source: string }>
}

/** Builds the EPUB's title metadata field: "Title: Subtitle" when a subtitle is set, otherwise just "Title". */
function epubTitle(meta: Pick<BookMeta, 'title' | 'subtitle'>): string {
  return meta.title + (meta.subtitle ? `: ${meta.subtitle}` : '')
}

/** Loads KaTeX's stylesheet for inlining, when at least one chapter rendered math. Best-effort: a missing or unreadable file means the EPUB ships without inlined KaTeX CSS rather than failing the whole export. */
async function loadKatexCss(): Promise<string | undefined> {
  try {
    const esmRequire = createRequire(import.meta.url)
    const katexCssPath = esmRequire.resolve('katex/dist/katex.min.css')
    return await readFile(katexCssPath, 'utf-8')
  } catch {
    console.warn('[export-epub] Could not load KaTeX CSS')
    return undefined
  }
}

export function createExportEpub(deps: ExportEpubDeps) {
  const { bookRepository, artifactStore, backgroundTasks, diagramRenderer, epubExport } = deps

  async function runExport(meta: BookMeta, taskId: string, signal: AbortSignal): Promise<void> {
    const toc = await bookRepository.getToc(meta.id)

    // Phase 1: convert every chapter's markdown to HTML. KaTeX renders
    // inline; mermaid code blocks become placeholder divs, extracted
    // alongside their raw source for phase 2.
    const chapterResults: ChapterHtml[] = []
    for (let i = 1; i <= meta.totalChapters; i++) {
      if (signal.aborted) return
      backgroundTasks.report(taskId, i, `Converting chapter ${i} of ${meta.totalChapters}`)
      const md = await bookRepository.getChapter(meta.id, i)
      const result = await markdownToHtml(md, { preserveSources: true })
      chapterResults.push({
        title: toc.chapters[i - 1]?.title ?? `Chapter ${i}`,
        ...result,
      })
    }

    if (signal.aborted) return

    // Phase 2: batch-render every mermaid chart across every chapter in one
    // call, rather than one request per chart.
    const allMermaidSources = chapterResults.flatMap((ch) => ch.mermaidBlocks.map((b) => b.source))

    let allMermaidSvgs: string[] = []
    if (allMermaidSources.length > 0) {
      backgroundTasks.report(taskId, meta.totalChapters, `Rendering ${allMermaidSources.length} diagram(s)...`)
      try {
        allMermaidSvgs = await diagramRenderer.render(allMermaidSources)
      } catch (err) {
        console.error('[export-epub] Batch diagram render failed:', err)
      }
    }

    if (signal.aborted) return

    // Phase 3: substitute each mermaid placeholder with its rendered markup
    // (or a readable fallback), and embed the round-trip hidden divs.
    let svgIndex = 0
    const chapters: EpubExportChapter[] = chapterResults.map((ch, i) => {
      let html = ch.html
      for (const block of ch.mermaidBlocks) {
        const svg = allMermaidSvgs[svgIndex]
        html = substituteMermaidPlaceholder(html, block.placeholder, renderMermaidBlockHtml(block.source, svg))
        svgIndex++
      }
      html = embedChapterDescription(html, toc.chapters[i]?.description ?? '')
      return { title: ch.title, html }
    })

    if (chapters.length > 0) {
      chapters[0].html = embedBookMeta(chapters[0].html, meta)
    }

    if (signal.aborted) return

    backgroundTasks.report(taskId, meta.totalChapters, 'Assembling EPUB...')

    const hasMath = chapterResults.some((ch) => ch.html.includes('class="katex"'))
    const css = hasMath ? await loadKatexCss() : undefined
    const coverPath = (await artifactStore.getCoverPath(meta.id)) ?? undefined

    const epubBuffer = await epubExport.build({
      title: epubTitle(meta),
      author: 'Tutor',
      ...(css ? { css } : {}),
      ...(coverPath ? { coverPath } : {}),
      chapters,
    })

    await artifactStore.writeEpub(meta.id, epubBuffer)

    backgroundTasks.succeed(taskId, { path: `/api/books/${meta.id}/export-epub` })
  }

  return async function exportEpub(bookId: string): Promise<ExportEpubResult> {
    const meta = await bookRepository.getBook(bookId)

    if (meta.generatedUpTo < meta.totalChapters) {
      return { outcome: 'not-complete' }
    }

    if (artifactStore.epubExists(bookId)) {
      return { outcome: 'cached', path: `/api/books/${bookId}/export-epub` }
    }

    if (backgroundTasks.findActive(bookId, 'generate-epub')) {
      return { outcome: 'in-progress' }
    }

    const handle = backgroundTasks.start({
      type: 'generate-epub',
      bookId,
      bookTitle: meta.title,
      total: meta.totalChapters,
    })

    ;(async () => {
      try {
        await runExport(meta, handle.id, handle.signal)
      } catch (err) {
        if (handle.signal.aborted) return
        console.error('[export-epub] EPUB generation failed:', err)
        backgroundTasks.fail(handle.id, err instanceof Error ? err.message : 'EPUB export failed')
      }
    })()

    return { outcome: 'started', taskId: handle.id }
  }
}

export interface GetEpubFileDeps {
  bookRepository: Pick<BookRepository, 'getBook'>
  artifactStore: Pick<ArtifactStore, 'epubExists' | 'epubPath'>
}

export interface EpubFile {
  data: Buffer
  filename: string
}

/**
 * Reads the cached EPUB file for download. Resolves to null when no EPUB
 * has been generated yet, for the route to answer 404, exactly as
 * epubExists false did before this extraction.
 */
export async function getEpubFile(bookId: string, deps: GetEpubFileDeps): Promise<EpubFile | null> {
  const meta = await deps.bookRepository.getBook(bookId)
  if (!deps.artifactStore.epubExists(bookId)) return null
  const data = await readFile(deps.artifactStore.epubPath(bookId))
  const filename = `${meta.title.replace(/[^a-zA-Z0-9 ]/g, '')}.epub`
  return { data, filename }
}
