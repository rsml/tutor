import { describe, expect, it } from 'vitest'
import type { EpubImport } from './epub-import.js'

const SAMPLE_BYTES = Buffer.from('pretend this is epub bytes')

/**
 * Behavior every EpubImport implementation must satisfy. Treats the subject
 * as a black box returning canned or parsed data, never inspecting how it
 * got there, so the same suite can run against a fake today and a real
 * EPUB-parsing adapter later.
 */
export function describeEpubImportContract(label: string, makeSubject: () => EpubImport | Promise<EpubImport>) {
  describe(`EpubImport contract (${label})`, () => {
    it('preview returns the documented EpubPreview fields', async () => {
      const subject = await makeSubject()
      const preview = await subject.preview(SAMPLE_BYTES)

      expect(typeof preview.title).toBe('string')
      expect(typeof preview.chapterCount).toBe('number')
      expect(typeof preview.hasCover).toBe('boolean')
      if (preview.subtitle !== undefined) expect(typeof preview.subtitle).toBe('string')
      if (preview.coverBase64 !== undefined) expect(typeof preview.coverBase64).toBe('string')
    })

    it('read returns chapters in a stable order', async () => {
      const subject = await makeSubject()
      const first = await subject.read(SAMPLE_BYTES)
      const second = await subject.read(SAMPLE_BYTES)

      expect(first.chapters.length).toBeGreaterThan(0)
      for (const chapter of first.chapters) {
        expect(typeof chapter.title).toBe('string')
        expect(typeof chapter.description).toBe('string')
        expect(typeof chapter.markdown).toBe('string')
      }
      // Reading the same bytes twice must recover the same order every
      // time. A real EPUB has one true spine order; nothing about reading
      // it should be allowed to shuffle the result.
      expect(second.chapters.map(c => c.title)).toEqual(first.chapters.map(c => c.title))
    })

    it('preview persists nothing: repeated calls return independent values', async () => {
      const subject = await makeSubject()
      const first = await subject.preview(SAMPLE_BYTES)
      const second = await subject.preview(SAMPLE_BYTES)
      expect(second).toEqual(first)

      // A reader with nothing to write to can only hand back independent
      // values. If preview() were secretly caching to, or reading back
      // from, shared storage, mutating one result would leak into the
      // next call's answer.
      first.title = 'MUTATED'
      expect(second.title).not.toBe('MUTATED')
    })

    it('read persists nothing: repeated calls return independent values', async () => {
      const subject = await makeSubject()
      const first = await subject.read(SAMPLE_BYTES)
      const second = await subject.read(SAMPLE_BYTES)
      expect(second).toEqual(first)

      // Same argument as above, exercised on the richer shape: mutating
      // the chapters array, the meta, and the cover of one result must
      // never be visible through a separate call.
      first.chapters.push({ title: 'MUTATED', description: '', markdown: '' })
      first.meta.title = 'MUTATED'
      if (first.cover) first.cover.mediaType = 'MUTATED'

      expect(second.chapters).not.toEqual(first.chapters)
      expect(second.meta.title).not.toBe('MUTATED')
      if (second.cover) expect(second.cover.mediaType).not.toBe('MUTATED')
    })
  })
}
