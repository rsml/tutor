import { afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ArtifactStore } from '../ports/artifact-store.js'
import { describeArtifactStoreContract } from '../ports/artifact-store.contract.js'
import { createFsArtifactStore } from './fs-artifact-store.js'

// Runs the shared ArtifactStore contract against the real filesystem
// adapter, over a fresh temp directory per subject so a failing assertion
// never touches, and this suite never even risks touching, the real data
// directory a running app would use.

const tempDirs: string[] = []

async function makeSubject(): Promise<ArtifactStore> {
  const dataDir = await mkdtemp(join(tmpdir(), 'tutor-fs-artifact-store-test-'))
  tempDirs.push(dataDir)
  return createFsArtifactStore({ dataDir })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describeArtifactStoreContract('real fs adapter', makeSubject)
