import { describe, expect, it } from 'vitest'
import type { EpubExport } from './epub-export.js'

/**
 * Behavior every EpubExport implementation must satisfy. Assertions stay
 * black-box: they never assume how the bytes are encoded, only that valid
 * input produces bytes and that chapter order actually reaches the output,
 * so the same suite works for a fake today and a real epub-gen-memory
 * adapter later.
 */
export function describeEpubExportContract(label: string, makeSubject: () => EpubExport | Promise<EpubExport>) {
  describe(`EpubExport contract (${label})`, () => {
    it('produces non-empty bytes for valid input', async () => {
      const subject = await makeSubject()
      const buffer = await subject.build({
        title: 'A Book',
        author: 'Tutor',
        chapters: [
          { title: 'Chapter One', html: '<p>one</p>' },
          { title: 'Chapter Two', html: '<p>two</p>' },
        ],
      })

      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(0)
    })

    it('builds successfully without the optional css or coverPath', async () => {
      const subject = await makeSubject()
      const buffer = await subject.build({
        title: 'No Extras',
        author: 'Tutor',
        chapters: [{ title: 'Only Chapter', html: '<p>only</p>' }],
      })

      expect(buffer.length).toBeGreaterThan(0)
    })

    it('preserves chapter order: swapping the order changes the output', async () => {
      const subject = await makeSubject()
      const request = {
        title: 'Order Test',
        author: 'Tutor',
        chapters: [
          { title: 'First', html: '<p>1</p>' },
          { title: 'Second', html: '<p>2</p>' },
        ],
      }

      const forward = await subject.build(request)
      const reversed = await subject.build({ ...request, chapters: [...request.chapters].reverse() })

      expect(forward.equals(reversed)).toBe(false)
    })
  })
}
