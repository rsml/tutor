import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { describeKeyVaultContract } from '../ports/key-vault.contract.js'
import { createFileKeyVault } from './file-key-vault.js'

// Every subject built below gets its own fresh temp dir, tracked here and
// removed afterward, so this suite never reads or writes the real on-disk
// data directory regardless of what TUTOR_DATA_DIR is set to.
const tempDirs: string[] = []

afterEach(async () => {
  const dirs = tempDirs.splice(0)
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describeKeyVaultContract('real file adapter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tutor-key-vault-'))
  tempDirs.push(dir)
  return createFileKeyVault({ dataDir: dir })
})
