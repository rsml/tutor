import { afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BookRepository } from '../ports/book-repository.js'
import { describeBookRepositoryContract } from '../ports/book-repository.contract.js'
import { createFsBookRepository } from './fs-book-repository.js'

// Runs the shared BookRepository contract against the real filesystem
// adapter, over a fresh temp directory per subject so a failing assertion
// never touches, and this suite never even risks touching, the real data
// directory a running app would use.

const tempDirs: string[] = []

async function makeSubject(): Promise<BookRepository> {
  const dataDir = await mkdtemp(join(tmpdir(), 'tutor-fs-book-repository-test-'))
  tempDirs.push(dataDir)
  return createFsBookRepository({ dataDir })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describeBookRepositoryContract('real fs adapter', makeSubject)
