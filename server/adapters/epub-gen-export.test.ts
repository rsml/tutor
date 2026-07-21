import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EPub_ from 'epub2'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeEpubExportContract } from '../ports/epub-export.contract.js'
import { createEpubGenExport } from './epub-gen-export.js'

// epub2's default export is the module namespace; the actual class is on .default
const EPub = (EPub_ as unknown as { default: typeof EPub_ }).default ?? EPub_

// epub-gen-memory builds the EPUB zip entirely in memory from inline HTML,
// with no network access needed for this project's usage (no remote image
// or font URLs), so the contract runs against the real adapter here.
describeEpubExportContract('real epub-gen-memory adapter', () => createEpubGenExport())

// A minimal valid 1x1 transparent PNG, for tests that need a real cover file.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

describe('createEpubGenExport (whitebox)', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('produces a real EPUB zip, not a stand-in encoding', async () => {
    const exporter = createEpubGenExport()
    const buffer = await exporter.build({
      title: 'Zip Check',
      author: 'Tutor',
      chapters: [{ title: 'One', html: '<p>hello</p>' }],
    })

    // EPUB is a zip archive; every zip starts with the local file header signature.
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })

  it('inlines the given css into the built EPUB', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epub-gen-export-test-'))
    tmpDirs.push(dir)

    const exporter = createEpubGenExport()
    const buffer = await exporter.build({
      title: 'CSS Check',
      author: 'Tutor',
      css: '.marker-rule-xyz { color: red; }',
      chapters: [{ title: 'One', html: '<p>hello</p>' }],
    })

    // The css ends up as a deflated zip entry, so round-trip through the
    // real parser rather than searching the raw compressed bytes.
    const epubPath = join(dir, 'output.epub')
    await writeFile(epubPath, buffer)
    const parsed = await EPub.createAsync(epubPath)
    try {
      const [cssData] = await parsed.getFileAsync('css')
      expect(cssData.toString('utf-8')).toContain('marker-rule-xyz')
    } finally {
      await unlink(epubPath).catch(() => {})
    }
  })

  it('converts a filesystem coverPath to a file:// URL and embeds the cover', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epub-gen-export-test-'))
    tmpDirs.push(dir)
    const coverPath = join(dir, 'cover.png')
    await writeFile(coverPath, ONE_PIXEL_PNG)

    const exporter = createEpubGenExport()
    const buffer = await exporter.build({
      title: 'Cover Check',
      author: 'Tutor',
      coverPath,
      chapters: [{ title: 'One', html: '<p>hello</p>' }],
    })

    // Round-trip through the real EPUB parser used elsewhere in this
    // project to confirm the cover was actually embedded, rather than
    // assuming anything about the zip's internal byte layout.
    const epubPath = join(dir, 'output.epub')
    await writeFile(epubPath, buffer)
    const parsed = await EPub.createAsync(epubPath)
    try {
      expect(parsed.metadata?.cover).toBeTruthy()
      const [coverData] = await parsed.getImageAsync(parsed.metadata.cover as string)
      expect(Buffer.from(coverData as unknown as Buffer)).toEqual(ONE_PIXEL_PNG)
    } finally {
      await unlink(epubPath).catch(() => {})
    }
  })

  it('resolves the callable when epub-gen-memory default is itself a function', async () => {
    const fn = vi.fn(async () => Buffer.from('single-default-output'))
    const exporter = createEpubGenExport({ loadEpubGenMemory: async () => ({ default: fn }) })

    const result = await exporter.build({
      title: 'Single Default',
      author: 'Tutor',
      chapters: [{ title: 'One', html: '<p>x</p>' }],
    })

    expect(result).toEqual(Buffer.from('single-default-output'))
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Single Default', author: 'Tutor' }),
      [{ title: 'One', content: '<p>x</p>' }],
    )
  })

  it('resolves the callable when epub-gen-memory is double-wrapped as default.default', async () => {
    const fn = vi.fn(async () => Buffer.from('double-default-output'))
    const exporter = createEpubGenExport({ loadEpubGenMemory: async () => ({ default: { default: fn } }) })

    const result = await exporter.build({
      title: 'Double Default',
      author: 'Tutor',
      chapters: [{ title: 'One', html: '<p>x</p>' }],
    })

    expect(result).toEqual(Buffer.from('double-default-output'))
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Double Default', author: 'Tutor' }),
      [{ title: 'One', content: '<p>x</p>' }],
    )
  })

  it('propagates a failure from the underlying epub-gen-memory load', async () => {
    const exporter = createEpubGenExport({
      loadEpubGenMemory: async () => { throw new Error('module load failed') },
    })

    await expect(exporter.build({
      title: 'Broken',
      author: 'Tutor',
      chapters: [{ title: 'One', html: '<p>hello</p>' }],
    })).rejects.toThrow('module load failed')
  })
})
