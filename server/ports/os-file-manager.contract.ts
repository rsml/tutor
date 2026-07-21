import { describe, expect, it } from 'vitest'
import type { OsFileManager } from './os-file-manager.js'

/**
 * Behavior every OsFileManager implementation must satisfy. Written
 * against the OsFileManager surface only, so this suite can run against
 * the fake now and a real spawn-based adapter later. It cannot assert on
 * whether the OS actually revealed the file, since that is inherently
 * unobservable from here (and best-effort even in the real adapter); it
 * only pins that reveal() resolves rather than rejecting.
 */
export function describeOsFileManagerContract(label: string, makeSubject: () => OsFileManager | Promise<OsFileManager>) {
  describe(`OsFileManager contract (${label})`, () => {
    it('reveal resolves for a path', async () => {
      const subject = await makeSubject()
      await expect(subject.reveal('/books/some-book/audiobook.m4b')).resolves.toBeUndefined()
    })

    it('reveal resolves for multiple paths called in sequence', async () => {
      const subject = await makeSubject()
      await subject.reveal('/books/book-a/audiobook.m4b')
      await expect(subject.reveal('/books/book-b/audiobook.m4b')).resolves.toBeUndefined()
    })
  })
}
