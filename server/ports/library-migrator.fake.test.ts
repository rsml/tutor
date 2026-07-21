import { describe, expect, it } from 'vitest'
import type { MigrationReport } from './library-migrator.js'
import { createFakeLibraryMigrator } from './library-migrator.fake.js'
import { describeLibraryMigratorContract } from './library-migrator.contract.js'

describeLibraryMigratorContract('fake', () => createFakeLibraryMigrator())

describe('createFakeLibraryMigrator (whitebox)', () => {
  it('defaults to reporting an absent profile and no books', async () => {
    const fake = createFakeLibraryMigrator()
    expect(await fake.migrate()).toEqual({ profile: { outcome: 'absent' }, books: [] })
  })

  it('reports exactly the report it was constructed with', async () => {
    const scripted: MigrationReport = {
      profile: { outcome: 'migrated', from: 1, to: 2 },
      books: [{ bookId: 'book-1', outcome: 'migrated', from: 1, to: 2 }],
    }
    const fake = createFakeLibraryMigrator(scripted)
    expect(await fake.migrate()).toEqual(scripted)
  })

  it('counts calls, so a test can assert on boot ordering', async () => {
    const fake = createFakeLibraryMigrator()
    expect(fake.calls).toBe(0)
    await fake.migrate()
    expect(fake.calls).toBe(1)
    await fake.migrate()
    expect(fake.calls).toBe(2)
  })

  it('never lets a caller mutate the scripted report through a returned copy', async () => {
    const scripted: MigrationReport = { profile: { outcome: 'absent' }, books: [] }
    const fake = createFakeLibraryMigrator(scripted)

    const first = await fake.migrate()
    first.books.push({ bookId: 'injected', outcome: 'current' })

    const second = await fake.migrate()
    expect(second.books).toEqual([])
  })
})
