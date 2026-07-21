import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { describe, it, expect } from 'vitest'
import { LearningProfileSchema } from '@shared/domain.js'
import { materializeProfileDefaults } from './001-materialize-defaults.js'

// Exercised against the real, committed v1 fixtures. See
// server/migrations/__fixtures__/README.md.

async function readRawFixture(relativePathUnderFixtures: string): Promise<Record<string, unknown>> {
  const url = new URL(`../__fixtures__/${relativePathUnderFixtures}`, import.meta.url)
  const content = await readFile(fileURLToPath(url), 'utf-8')
  return parseYaml(content)
}

describe('materializeProfileDefaults', () => {
  it('is a step that produces schema version 2', () => {
    expect(materializeProfileDefaults.to).toBe(2)
  })

  it('materializes skills and preserves every preference on the library profile', async () => {
    const raw = await readRawFixture('v1-library/books/learning-profile.yml')
    const result = materializeProfileDefaults.migrate(raw)

    expect(result.skills).toEqual([])
    expect(result.style).toContain('Concrete example first')
    expect(result.identity).toBe('A backend engineer moving into distributed systems work.')

    const preferences = result.preferences as Record<string, unknown>
    expect(preferences.explainComplexTermsSimply).toBe(true)
    expect(preferences.codeExamples).toBe(true)
    expect(preferences.realWorldAnalogies).toBe(true)
    expect(preferences.includeRecaps).toBe(true)
    expect(preferences.includeSummaries).toBe(true)
    expect(preferences.visualDescriptions).toBe(false)
    expect(preferences.depthLevel).toBe(4)
    expect(preferences.pacePreference).toBe(3)
    expect(preferences.metaphorDensity).toBe(2)
    expect(preferences.narrativeStyle).toBe(3)
    expect(preferences.humorLevel).toBe(2)
    expect(preferences.formalityLevel).toBe(3)
  })

  it('materializes skills and preserves every preference on the profile-only fixture', async () => {
    const raw = await readRawFixture('v1-profile-only/books/learning-profile.yml')
    const result = materializeProfileDefaults.migrate(raw)

    expect(result.skills).toEqual([])
    expect(result.style).toBe('Plain language, no jargon until it has been earned.')
    expect(result.identity).toBe('A product designer learning enough engineering to argue with engineers.')

    const preferences = result.preferences as Record<string, unknown>
    expect(preferences.explainComplexTermsSimply).toBe(true)
    expect(preferences.codeExamples).toBe(false)
    expect(preferences.realWorldAnalogies).toBe(true)
    expect(preferences.includeRecaps).toBe(true)
    expect(preferences.includeSummaries).toBe(true)
    expect(preferences.visualDescriptions).toBe(true)
    expect(preferences.depthLevel).toBe(2)
    expect(preferences.pacePreference).toBe(4)
    expect(preferences.metaphorDensity).toBe(4)
    expect(preferences.narrativeStyle).toBe(4)
    expect(preferences.humorLevel).toBe(3)
    expect(preferences.formalityLevel).toBe(2)
  })

  it('never clobbers an already-populated skills value', () => {
    const raw = { style: 'x', skills: [{ name: 'Rust', level: 3 }] }
    const result = materializeProfileDefaults.migrate(raw)
    expect(result.skills).toEqual([{ name: 'Rust', level: 3 }])
  })

  it('produces output that parses cleanly under LearningProfileSchema', async () => {
    const raw = await readRawFixture('v1-library/books/learning-profile.yml')
    const result = materializeProfileDefaults.migrate(raw)
    expect(() => LearningProfileSchema.parse(result)).not.toThrow()
  })
})
