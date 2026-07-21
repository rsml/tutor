import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createSaveReference, createListReferences, createGetReference } from './references.js'

// TDD: written before server/services/authoring/references.ts exists,
// against the BookRepository fake. Moves PUT /api/books/:id/references/:name,
// GET /api/books/:id/references, and GET /api/books/:id/references/:name out
// of authoring.ts.

describe('references', () => {
  it('saves a reference so it can be read back and appears in the manifest', async () => {
    const books = createFakeBookRepository()
    const saveReference = createSaveReference({ books })
    const listReferences = createListReferences({ books })
    const getReference = createGetReference({ books })

    await saveReference('book-1', 'source-a', 'Reference content.')

    await expect(getReference('book-1', 'source-a')).resolves.toBe('Reference content.')
    await expect(listReferences('book-1')).resolves.toEqual([{ name: 'source-a' }])
  })

  it('returns an empty manifest when the book has no references yet', async () => {
    const listReferences = createListReferences({ books: createFakeBookRepository() })
    await expect(listReferences('book-1')).resolves.toEqual([])
  })

  it('rejects a reference name with characters other than letters, digits, and hyphens', async () => {
    const saveReference = createSaveReference({ books: createFakeBookRepository() })
    await expect(saveReference('book-1', 'bad name!', 'content')).rejects.toThrow()
  })
})
