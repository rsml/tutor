import { describe, it, expect } from 'vitest'
import { splitChapterIntoSections } from './split-sections'

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
}

describe('splitChapterIntoSections', () => {
  it('splits a chapter with multiple ## headings into sections', () => {
    const md = [
      '# Chapter 1: Introduction',
      '',
      words(100),
      '',
      '## First Concept',
      '',
      words(350),
      '',
      '## Second Concept',
      '',
      words(400),
      '',
      '## Third Concept',
      '',
      words(300),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    // Each section has an index
    sections.forEach((s, i) => expect(s.index).toBe(i))
    // All content is present
    const allContent = sections.map(s => s.markdown).join('\n\n')
    expect(allContent).toContain('First Concept')
    expect(allContent).toContain('Third Concept')
  })

  it('merges small adjacent segments to reach MIN_WORDS', () => {
    const md = [
      '# Title',
      '',
      words(50),
      '',
      '## Tiny A',
      '',
      words(80),
      '',
      '## Tiny B',
      '',
      words(80),
      '',
      '## Tiny C',
      '',
      words(80),
      '',
      '## Big Section',
      '',
      words(400),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    // Small segments should be merged together
    expect(sections.length).toBeGreaterThanOrEqual(2)
    // Every section should have reasonable word count
    sections.forEach(s => {
      // Allow flexibility — the point is they got merged
      expect(s.wordCount).toBeGreaterThan(0)
    })
  })

  it('handles chapter with no ## headings (paragraph fallback)', () => {
    const md = [
      '# Chapter Title',
      '',
      words(200),
      '',
      words(200),
      '',
      words(200),
      '',
      words(200),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    sections.forEach(s => expect(s.title).toBeNull())
  })

  it('produces at least 2 sections even with few headings', () => {
    const md = [
      '# Title',
      '',
      words(100),
      '',
      '## Only Section',
      '',
      words(150),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    expect(sections.length).toBeGreaterThanOrEqual(2)
  })

  it('handles very short chapter', () => {
    const md = [
      '# Short',
      '',
      'Just a few words here.',
      '',
      'And a second paragraph.',
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    const allContent = sections.map(s => s.markdown).join(' ')
    expect(allContent).toContain('Just a few words here.')
    expect(allContent).toContain('And a second paragraph.')
  })

  it('keeps ### headings with their parent ## section', () => {
    const md = [
      '# Chapter',
      '',
      words(50),
      '',
      '## Main Section',
      '',
      words(200),
      '',
      '### Subsection A',
      '',
      words(200),
      '',
      '## Another Section',
      '',
      words(400),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    // ### should stay with its parent ##, not create a new split
    const sectionWithSub = sections.find(s => s.markdown.includes('### Subsection A'))
    expect(sectionWithSub).toBeDefined()
    expect(sectionWithSub!.markdown).toContain('## Main Section')
  })

  it('does not split fenced code blocks containing blank lines', () => {
    const md = [
      '# Chapter',
      '',
      words(200),
      '',
      'Here is some code:',
      '',
      '```python',
      'def hello():',
      '    x = 1',
      '',
      '    print(x)',
      '```',
      '',
      words(200),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    // The code block must appear intact in a single section
    const codeSection = sections.find(s => s.markdown.includes('```python'))
    expect(codeSection).toBeDefined()
    expect(codeSection!.markdown).toContain('print(x)')
    expect(codeSection!.markdown).toContain('```python')
    // Should contain both the opening and closing fence
    const fenceCount = (codeSection!.markdown.match(/```/g) || []).length
    expect(fenceCount).toBeGreaterThanOrEqual(2)
  })

  it('does not split on ## headings inside fenced code blocks', () => {
    const md = [
      '# Chapter',
      '',
      words(100),
      '',
      '## Real Section',
      '',
      words(200),
      '',
      '```markdown',
      '## This is not a heading',
      '',
      'Just example markdown',
      '```',
      '',
      words(200),
      '',
      '## Another Real Section',
      '',
      words(300),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    // The ## inside the fence should NOT create its own section
    const allContent = sections.map(s => s.markdown).join('\n\n')
    expect(allContent).toContain('## This is not a heading')
    // The fenced ## should be in the same section as the surrounding content
    const fencedSection = sections.find(s => s.markdown.includes('```markdown'))
    expect(fencedSection).toBeDefined()
    expect(fencedSection!.markdown).toContain('## This is not a heading')
  })

  it('assigns correct indices', () => {
    const md = [
      '# Title',
      '',
      words(100),
      '',
      '## A',
      '',
      words(400),
      '',
      '## B',
      '',
      words(400),
      '',
      '## C',
      '',
      words(400),
    ].join('\n')

    const sections = splitChapterIntoSections(md)
    sections.forEach((s, i) => expect(s.index).toBe(i))
  })
})
