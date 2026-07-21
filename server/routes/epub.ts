import type { FastifyInstance } from 'fastify'
import * as store from '../services/book-store.js'
import * as taskManager from '../services/task-manager.js'
import { bookIdSchema } from '../http/route-params.js'
import type { Ports } from '../composition-root.js'

export async function epubRoutes(fastify: FastifyInstance, _opts: { ports: Ports }) {
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/export-epub',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const bookId = request.params.id
      const meta = await store.getBook(bookId)

      if (meta.generatedUpTo < meta.totalChapters) {
        return reply.status(400).send({ error: 'Book is not complete — all chapters must be generated first' })
      }

      // Check for cached epub
      if (store.epubExists(bookId)) {
        return { cached: true, path: `/api/books/${bookId}/export-epub` }
      }

      if (taskManager.getActiveTaskForBook(bookId, 'generate-epub')) {
        return reply.status(409).send({ error: 'EPUB export already in progress' })
      }

      const task = taskManager.createTask('generate-epub', bookId, meta.title, meta.totalChapters)

      // Fire-and-forget
      ;(async () => {
        try {
          const { markdownToHtml } = await import('../services/markdown-html.js')

          const epubMod = await import('epub-gen-memory') as { default: unknown }
          // epub-gen-memory is CJS with __esModule — handle double-default
          const epubDefault = epubMod.default as Record<string, unknown>
          const epub = (typeof epubDefault === 'function' ? epubDefault : epubDefault.default) as
            (options: Record<string, unknown>, content: Array<{ title: string; content: string }>) => Promise<Buffer>
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
            const renderer = (fastify as unknown as { mermaidRenderer: ((charts: string[]) => Promise<string[]>) | null }).mermaidRenderer
            if (renderer) {
              try {
                allMermaidSvgs = await renderer(allMermaidSources)
              } catch (err) {
                console.error('[mermaid-renderer] Batch render failed:', err)
              }
            }
          }

          if (task.abortController.signal.aborted) return

          // Phase 3: Substitute mermaid SVGs into chapter HTML
          let svgIndex = 0
          const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

          const chapters: Array<{ title: string; content: string }> = chapterResults.map((ch, i) => {
            let html = ch.html
            for (const block of ch.mermaidBlocks) {
              const svg = allMermaidSvgs[svgIndex]
              const escapedSource = escHtml(block.source)

              let renderedHtml: string
              if (svg && !svg.startsWith('<pre>')) {
                // Successfully rendered — wrap in container + hidden source
                renderedHtml =
                  `<div class="tutor-mermaid-rendered">${svg}</div>` +
                  `<div class="tutor-mermaid-source" style="display:none">${escapedSource}</div>`
              } else {
                // Fallback (no renderer or render failed) — keep code block + hidden source
                renderedHtml =
                  `<pre><code class="language-mermaid">${escapedSource}</code></pre>` +
                  `<div class="tutor-mermaid-source" style="display:none">${escapedSource}</div>`
              }

              // Replace the placeholder div with the rendered content
              html = html.replace(
                new RegExp(`<div[^>]*>${block.placeholder}</div>`),
                renderedHtml
              )
              svgIndex++
            }

            // Embed chapter description for round-trip preservation
            const desc = toc.chapters[i]?.description ?? ''
            if (desc) {
              html = `<div class="tutor-chapter-description" style="display:none">${escHtml(desc)}</div>\n` + html
            }

            return { title: ch.title, content: html }
          })

          // Embed book-level metadata in first chapter for round-trip preservation
          if (chapters.length > 0) {
            const tutorMeta: Record<string, unknown> = {}
            if (meta.showTitleOnCover !== undefined) tutorMeta.showTitleOnCover = meta.showTitleOnCover
            if (meta.subtitle) tutorMeta.subtitle = meta.subtitle
            if (Object.keys(tutorMeta).length > 0) {
              chapters[0].content = `<div class="tutor-book-meta" style="display:none">${escHtml(JSON.stringify(tutorMeta))}</div>\n` + chapters[0].content
            }
          }

          if (task.abortController.signal.aborted) return

          taskManager.updateProgress(task.id, meta.totalChapters, 'Assembling EPUB...')

          // Build epub options
          const epubOptions: {
            title: string
            author: string
            numberChaptersInTOC: boolean
            prependChapterTitles: boolean
            cover?: string
            css?: string
          } = {
            title: meta.title + (meta.subtitle ? `: ${meta.subtitle}` : ''),
            author: 'Tutor',
            numberChaptersInTOC: false,
            prependChapterTitles: false,
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
          console.error('[epub-export] EPUB generation failed:', err)
          taskManager.failTask(task.id, err instanceof Error ? err.message : 'EPUB export failed')
        }
      })()

      return { taskId: task.id }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/export-epub',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const bookId = request.params.id
      const meta = await store.getBook(bookId)

      if (!store.epubExists(bookId)) {
        return reply.status(404).send({ error: 'No EPUB file — generate it first' })
      }

      const { readFile: readFileAsync } = await import('node:fs/promises')
      const data = await readFileAsync(store.epubPath(bookId))
      const filename = `${meta.title.replace(/[^a-zA-Z0-9 ]/g, '')}.epub`

      reply.header('Content-Type', 'application/epub+zip')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(data)
    },
  )
}
