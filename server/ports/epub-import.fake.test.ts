import { describe, expect, it } from 'vitest'
import { createFakeEpubImport } from './epub-import.fake.js'
import { describeEpubImportContract } from './epub-import.contract.js'

describeEpubImportContract('fake', () => createFakeEpubImport())

describe('createFakeEpubImport (whitebox)', () => {
  it('read returns the fixture chapters in the given order', async () => {
    const fake = createFakeEpubImport({
      book: {
        meta: { title: 'Ordered Book' },
        chapters: [
          { title: 'Alpha', description: 'a', markdown: 'a-content' },
          { title: 'Beta', description: 'b', markdown: 'b-content' },
          { title: 'Gamma', description: 'c', markdown: 'c-content' },
        ],
      },
    })

    const book = await fake.read(Buffer.from('irrelevant'))
    expect(book.chapters.map(c => c.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('records every call it receives, in order, with the input size', async () => {
    const fake = createFakeEpubImport()
    await fake.preview(Buffer.from('abc'))
    await fake.read(Buffer.from('abcde'))

    expect(fake.calls).toEqual([
      { method: 'preview', byteLength: 3 },
      { method: 'read', byteLength: 5 },
    ])
  })
})
