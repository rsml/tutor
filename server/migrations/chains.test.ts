import { describe, it, expect } from 'vitest'
import { CURRENT_BOOK_SCHEMA_VERSION, CURRENT_PROFILE_SCHEMA_VERSION } from '@shared/schema-version.js'
import { assertChainIntegrity } from './migrate.js'
import { BOOK_MIGRATIONS } from './book/index.js'
import { PROFILE_MIGRATIONS } from './profile/index.js'

// This is the test that turns "bumped CURRENT_BOOK_SCHEMA_VERSION (or
// CURRENT_PROFILE_SCHEMA_VERSION) without adding the matching migration
// step" into a failing test instead of a library nobody can read. Every
// time either constant moves, this file either still passes because a step
// was added to close the gap, or fails here, loudly, before the change
// ships.

describe('BOOK_MIGRATIONS', () => {
  it('is a contiguous chain matching CURRENT_BOOK_SCHEMA_VERSION', () => {
    expect(() => assertChainIntegrity(BOOK_MIGRATIONS, CURRENT_BOOK_SCHEMA_VERSION, 'book')).not.toThrow()
  })
})

describe('PROFILE_MIGRATIONS', () => {
  it('is a contiguous chain matching CURRENT_PROFILE_SCHEMA_VERSION', () => {
    expect(() =>
      assertChainIntegrity(PROFILE_MIGRATIONS, CURRENT_PROFILE_SCHEMA_VERSION, 'profile'),
    ).not.toThrow()
  })
})
