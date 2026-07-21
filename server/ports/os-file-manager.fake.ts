import type { OsFileManager } from './os-file-manager.js'

/** An OsFileManager that records what it was asked to reveal. */
export interface FakeOsFileManager extends OsFileManager {
  readonly revealed: string[]
}

/** Deterministic in-memory OsFileManager: never touches a real OS, just records. */
export function createFakeOsFileManager(): FakeOsFileManager {
  const revealed: string[] = []

  return {
    revealed,
    async reveal(path) {
      revealed.push(path)
    },
  }
}
