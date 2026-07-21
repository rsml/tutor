import type { EpubBuildRequest, EpubExport } from './epub-export.js'

/**
 * Deterministic in-memory EpubExport. Rather than a real EPUB (a zip
 * archive, which would need epub-gen-memory to produce or verify), this
 * fake encodes the request as a JSON manifest and returns it as bytes. That
 * keeps the output decodable in tests, including the black-box "chapter
 * order changes the output" property the contract test relies on, without
 * pulling in the real dependency.
 */
export function createFakeEpubExport(): EpubExport {
  return {
    async build(req: EpubBuildRequest): Promise<Buffer> {
      const manifest = {
        title: req.title,
        author: req.author,
        css: req.css ?? null,
        coverPath: req.coverPath ?? null,
        chapters: req.chapters.map(chapter => ({ title: chapter.title, html: chapter.html })),
      }
      return Buffer.from(JSON.stringify(manifest), 'utf-8')
    },
  }
}
