import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { describeEpubImportContract } from '../ports/epub-import.contract.js'
import { createEpubGenExport } from './epub-gen-export.js'
import { createEpub2Import } from './epub2-import.js'

/**
 * The generic contract drives every subject with the same placeholder
 * bytes (`Buffer.from('pretend this is epub bytes')`), which is enough for
 * a fake but not a real zip-backed parser. So this fixture builds one real,
 * valid, minimal EPUB up front (via the epub-gen-memory export adapter
 * built alongside this one, entirely in memory, no network) and the
 * makeSubject factory below wraps the real adapter so it always parses
 * that fixture regardless of what bytes the contract passes in. This
 * mirrors createFakeEpubImport's own documented behavior of ignoring its
 * bytes argument, and it exercises the real epub2 parser, Turndown
 * conversion, and TOC-page filtering end to end.
 */
async function buildFixtureEpub(): Promise<Buffer> {
  const exporter = createEpubGenExport()
  return exporter.build({
    title: 'Fixture Book',
    author: 'Tutor Test Suite',
    chapters: [
      { title: 'Chapter One', html: '<p>First chapter content for the fixture EPUB.</p>' },
      { title: 'Chapter Two', html: '<p>Second chapter content for the fixture EPUB.</p>' },
    ],
  })
}

const fixtureBytes = await buildFixtureEpub()

describeEpubImportContract('real epub2 adapter (fixture built via epub-gen-memory)', () => {
  const real = createEpub2Import()
  return {
    preview: (_bytes: Buffer) => real.preview(fixtureBytes),
    read: (_bytes: Buffer) => real.read(fixtureBytes),
  }
})

describe('createEpub2Import (whitebox)', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('recovers real chapter titles and markdown content from the fixture EPUB', async () => {
    const real = createEpub2Import()
    const book = await real.read(fixtureBytes)

    expect(book.chapters.map(c => c.title)).toEqual(['Chapter One', 'Chapter Two'])
    expect(book.chapters[0].markdown).toContain('First chapter content')
    expect(book.chapters[1].markdown).toContain('Second chapter content')
  })

  it('excludes the generated table-of-contents page from the chapter list', async () => {
    const real = createEpub2Import()
    const book = await real.read(fixtureBytes)

    // epub-gen-memory always emits its own toc.xhtml nav document into the
    // spine; a correct importer must never surface it as a chapter.
    expect(book.chapters.some(c => c.title.toLowerCase().includes('table of contents'))).toBe(false)
  })

  it('recovers Tutor round-trip metadata (mermaid source, subtitle, showTitleOnCover) through a full export/import cycle', async () => {
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const mermaidSource = 'graph TD\n  A["Start"] --> B["End"]'
    const tutorMeta = { subtitle: 'A Fixture Subtitle', showTitleOnCover: true }

    const exporter = createEpubGenExport()
    const bytes = await exporter.build({
      title: 'Round Trip Book: A Fixture Subtitle',
      author: 'Tutor Test Suite',
      chapters: [
        {
          title: 'Only Chapter',
          html:
            `<div class="tutor-book-meta" style="display:none">${escHtml(JSON.stringify(tutorMeta))}</div>\n` +
            `<div class="tutor-chapter-description" style="display:none">A recovered description</div>\n` +
            `<div class="tutor-mermaid-rendered"><svg>rendered</svg></div>` +
            `<div class="tutor-mermaid-source" style="display:none">${escHtml(mermaidSource)}</div>` +
            `<p>Chapter body text.</p>`,
        },
      ],
    })

    const real = createEpub2Import()
    const book = await real.read(bytes)

    expect(book.meta.title).toBe('Round Trip Book')
    expect(book.meta.subtitle).toBe('A Fixture Subtitle')
    expect(book.meta.showTitleOnCover).toBe(true)
    expect(book.chapters[0].description).toBe('A recovered description')
    expect(book.chapters[0].markdown).toContain('```mermaid')
    expect(book.chapters[0].markdown).toContain('A["Start"]')
    expect(book.chapters[0].markdown).not.toContain('<svg>')
  })

  it('throws a descriptive error for a file that is not a valid EPUB', async () => {
    const real = createEpub2Import()
    await expect(real.preview(Buffer.from('not an epub at all'))).rejects.toThrow(/Failed to parse EPUB/)
  })

  it('rejects an EPUB with no readable chapters', async () => {
    // toc.xhtml is the only spine item epub-gen-memory ever emits with zero
    // chapters, and it is always filtered out as a TOC page.
    const exporter = createEpubGenExport()
    const bytes = await exporter.build({ title: 'Empty Book', author: 'Tutor', chapters: [] })

    const real = createEpub2Import()
    await expect(real.read(bytes)).rejects.toThrow('No readable chapters found in EPUB')
  })

  it('uses an injected tmpDir for its scratch parse file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epub2-import-test-'))
    tmpDirs.push(dir)

    const real = createEpub2Import({ tmpDir: () => dir })
    const book = await real.read(fixtureBytes)

    expect(book.chapters.length).toBeGreaterThan(0)
  })
})
