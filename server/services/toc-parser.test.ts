import { describe, it, expect } from 'vitest'
import { parseTocFromMarkdown, truncateChapters } from './toc-parser.js'

describe('parseTocFromMarkdown', () => {
  it('parses title, subtitle, and chapters from canonical AI output', () => {
    const md = `# Resilient CSS
*Layout Systems for the Real World*

1. **The Box Model Revisited** — Understanding the foundation.
2. **Flexbox Deep Dive** — Layout patterns.
`
    const result = parseTocFromMarkdown(md)
    expect(result.title).toBe('Resilient CSS')
    expect(result.subtitle).toBe('Layout Systems for the Real World')
    expect(result.chapters).toEqual([
      { title: 'The Box Model Revisited', description: 'Understanding the foundation.' },
      { title: 'Flexbox Deep Dive', description: 'Layout patterns.' },
    ])
  })

  it('accepts en-dash, hyphen, and colon as separators', () => {
    const md = `# X
1. **A** — first
2. **B** – second
3. **C** - third
4. **D** : fourth
`
    const result = parseTocFromMarkdown(md)
    expect(result.chapters.map(c => c.title)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('defaults to "Untitled Book" if chapters parsed but no title heading', () => {
    const md = `1. **A** — first
2. **B** — second
`
    expect(parseTocFromMarkdown(md).title).toBe('Untitled Book')
  })

  it('returns empty chapters when markdown has no numbered list', () => {
    expect(parseTocFromMarkdown('# Title\n\nJust some prose.').chapters).toEqual([])
  })

  it('accepts H2 subtitle as a fallback when no italic line', () => {
    const md = `# Title
## A subtitle here
1. **A** — first
`
    expect(parseTocFromMarkdown(md).subtitle).toBe('A subtitle here')
  })
})

describe('truncateChapters', () => {
  it('truncates when over target', () => {
    expect(truncateChapters([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3])
  })

  it('returns as-is when under or equal to target', () => {
    expect(truncateChapters([1, 2], 3)).toEqual([1, 2])
    expect(truncateChapters([1, 2, 3], 3)).toEqual([1, 2, 3])
  })
})
