import { describe, it, expect } from 'vitest'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { suggestSkills } from './suggest-skills.js'

describe('suggestSkills', () => {
  it('asks the model for skills based on the given background', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ skills: [{ name: 'React', level: 6 }] })

    const result = await suggestSkills({ textGeneration }, {
      model: 'claude-sonnet-4-6',
      aboutMe: 'A frontend developer who loves React.',
      existingSkills: [],
    })

    expect(result).toEqual({ skills: [{ name: 'React', level: 6 }] })
    expect(textGeneration.requests.generateObject[0].prompt).toContain('A frontend developer who loves React.')
  })

  it('tells the model not to repeat any existing skills', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ skills: [] })

    await suggestSkills({ textGeneration }, {
      model: 'claude-sonnet-4-6',
      aboutMe: 'A backend engineer.',
      existingSkills: [{ name: 'Node.js', level: 8 }],
    })

    const { prompt } = textGeneration.requests.generateObject[0]
    expect(prompt).toContain('do NOT suggest duplicates')
    expect(prompt).toContain('Node.js: 8/10')
  })

  it('omits the existing-skills section entirely when there are none', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ skills: [] })

    await suggestSkills({ textGeneration }, { model: 'claude-sonnet-4-6', aboutMe: 'A backend engineer.', existingSkills: [] })

    expect(textGeneration.requests.generateObject[0].prompt).not.toContain('do NOT suggest duplicates')
  })

  it('defaults to the anthropic provider when none is given', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptGenerateObject({ skills: [] })

    await suggestSkills({ textGeneration }, { model: 'claude-sonnet-4-6', aboutMe: 'x', existingSkills: [] })

    expect(textGeneration.requests.generateObject[0].model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
  })
})
