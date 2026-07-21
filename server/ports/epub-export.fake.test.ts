import { describe, expect, it } from 'vitest'
import { createFakeEpubExport } from './epub-export.fake.js'
import { describeEpubExportContract } from './epub-export.contract.js'

describeEpubExportContract('fake', () => createFakeEpubExport())

describe('createFakeEpubExport (whitebox)', () => {
  it('encodes the request as a decodable manifest, preserving title, author, css, coverPath, and chapters', async () => {
    const fake = createFakeEpubExport()
    const buffer = await fake.build({
      title: 'My Book',
      author: 'Tutor',
      css: '.katex {}',
      coverPath: '/covers/1.png',
      chapters: [
        { title: 'One', html: '<p>1</p>' },
        { title: 'Two', html: '<p>2</p>' },
      ],
    })

    const manifest = JSON.parse(buffer.toString('utf-8'))
    expect(manifest).toEqual({
      title: 'My Book',
      author: 'Tutor',
      css: '.katex {}',
      coverPath: '/covers/1.png',
      chapters: [
        { title: 'One', html: '<p>1</p>' },
        { title: 'Two', html: '<p>2</p>' },
      ],
    })
  })

  it('encodes missing css and coverPath as null rather than dropping the keys', async () => {
    const fake = createFakeEpubExport()
    const buffer = await fake.build({
      title: 'No Extras',
      author: 'Tutor',
      chapters: [{ title: 'Only', html: '<p>only</p>' }],
    })

    const manifest = JSON.parse(buffer.toString('utf-8'))
    expect(manifest.css).toBeNull()
    expect(manifest.coverPath).toBeNull()
  })
})
