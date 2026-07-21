import { describe, expect, it } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { getProfileContext } from './profile-context.js'

describe('getProfileContext', () => {
  it('returns an empty string when no profile has been saved yet', async () => {
    const books = createFakeBookRepository()
    await expect(getProfileContext(books)).resolves.toBe('')
  })

  it('reads the saved profile and formats it through buildProfileContext', async () => {
    const books = createFakeBookRepository()
    await books.saveProfile({
      identity: 'Senior backend engineer',
      style: 'hands-on with real code',
      preferences: {
        explainComplexTermsSimply: true,
        codeExamples: true,
        realWorldAnalogies: true,
        includeRecaps: true,
        includeSummaries: true,
        visualDescriptions: true,
        depthLevel: 3,
        pacePreference: 3,
        metaphorDensity: 3,
        narrativeStyle: 3,
        humorLevel: 2,
        formalityLevel: 3,
      },
      skills: [{ name: 'TypeScript', level: 9 }],
    })

    const context = await getProfileContext(books)
    expect(context).toContain('Reader background: Senior backend engineer')
    expect(context).toContain('Strong knowledge (>=7): TypeScript (9/10)')
  })
})
