import { describe, it, expect } from 'vitest'
import { formatTocAsMarkdown } from './format-toc'

describe('formatTocAsMarkdown', () => {
  it('includes title, subtitle, and numbered chapters', () => {
    const md = formatTocAsMarkdown({
      title: 'Resilient CSS',
      subtitle: 'Layout Systems for the Real World',
      chapters: [
        { title: 'The Box Model', description: 'Foundations.' },
        { title: 'Flexbox', description: 'Patterns.' },
      ],
    })
    expect(md).toBe(
      '# Resilient CSS\n*Layout Systems for the Real World*\n\n1. **The Box Model** — Foundations.\n2. **Flexbox** — Patterns.',
    )
  })

  it('omits subtitle line when not provided', () => {
    const md = formatTocAsMarkdown({
      title: 'X',
      chapters: [{ title: 'A', description: 'a' }],
    })
    expect(md).toBe('# X\n\n1. **A** — a')
  })
})
