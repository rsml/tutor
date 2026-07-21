import { pathToFileURL } from 'node:url'
import type { EpubBuildRequest, EpubExport } from '../ports/epub-export.js'

/**
 * Wraps epub-gen-memory to build EPUB bytes from already-rendered chapter
 * HTML. Lifted from the POST /api/books/:id/export-epub route handler in
 * server/routes/books.ts, which built this same options object plus a
 * dynamic import of epub-gen-memory inline.
 *
 * epub-gen-memory ships as CJS with `__esModule` set. Under Node's ESM
 * loader a dynamic import() of it yields a double-wrapped default: this
 * project's own smoke test shows `mod.default` resolves to an object whose
 * own `.default` is the callable, but electron-builder's bundling of this
 * dependency has, in the past, produced a `mod.default` that is directly
 * callable. Both shapes are handled below. This is load-bearing for the
 * Electron production build, so it stays exactly as is; do not simplify it
 * away.
 */

type EpubGenFn = (
  options: Record<string, unknown>,
  content: Array<{ title: string; content: string }>,
) => Promise<Buffer>

export interface EpubGenExportDeps {
  /** Loads the epub-gen-memory module. Overridable in tests; defaults to a real dynamic import. */
  loadEpubGenMemory?: () => Promise<{ default: unknown }>
}

async function resolveEpubGenFn(loadEpubGenMemory: () => Promise<{ default: unknown }>): Promise<EpubGenFn> {
  const epubMod = await loadEpubGenMemory()
  // epub-gen-memory is CJS with __esModule — handle double-default
  const epubDefault = epubMod.default as Record<string, unknown>
  return (typeof epubDefault === 'function' ? epubDefault : epubDefault.default) as EpubGenFn
}

/** Factory for the EpubExport port, backed by the real epub-gen-memory library. */
export function createEpubGenExport(deps: EpubGenExportDeps = {}): EpubExport {
  const loadEpubGenMemory = deps.loadEpubGenMemory ?? (() => import('epub-gen-memory') as Promise<{ default: unknown }>)

  return {
    async build(req: EpubBuildRequest): Promise<Buffer> {
      const epub = await resolveEpubGenFn(loadEpubGenMemory)

      const options: Record<string, unknown> = {
        title: req.title,
        author: req.author,
        numberChaptersInTOC: false,
        prependChapterTitles: false,
      }
      if (req.css) options.css = req.css
      if (req.coverPath) options.cover = pathToFileURL(req.coverPath).href

      const content = req.chapters.map(chapter => ({ title: chapter.title, content: chapter.html }))
      return epub(options, content)
    },
  }
}
