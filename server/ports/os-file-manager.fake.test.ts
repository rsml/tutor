import { describe, expect, it } from 'vitest'
import { createFakeOsFileManager } from './os-file-manager.fake.js'
import { describeOsFileManagerContract } from './os-file-manager.contract.js'

describeOsFileManagerContract('fake', () => createFakeOsFileManager())

describe('createFakeOsFileManager (whitebox)', () => {
  it('records what it was asked to reveal, in order', async () => {
    const fake = createFakeOsFileManager()
    await fake.reveal('/books/book-a/audiobook.m4b')
    await fake.reveal('/books/book-b/audiobook.m4b')

    expect(fake.revealed).toEqual([
      '/books/book-a/audiobook.m4b',
      '/books/book-b/audiobook.m4b',
    ])
  })
})
