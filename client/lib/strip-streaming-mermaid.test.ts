import { describe, it, expect } from 'vitest'
import { stripStreamingUnclosedMermaid } from './strip-streaming-mermaid'

describe('stripStreamingUnclosedMermaid', () => {
  it('returns input unchanged when there are no fences', () => {
    const input = 'Some plain text\n\nMore text.'
    expect(stripStreamingUnclosedMermaid(input)).toBe(input)
  })

  it('returns input unchanged for a closed mermaid block', () => {
    const input = 'Intro\n\n```mermaid\ngraph TD\nA --> B\n```\n\nOutro'
    expect(stripStreamingUnclosedMermaid(input)).toBe(input)
  })

  it('strips a trailing unclosed mermaid block', () => {
    const input = 'Intro paragraph.\n\n```mermaid\ngraph TD\nA --> B'
    expect(stripStreamingUnclosedMermaid(input)).toBe('Intro paragraph.\n\n')
  })

  it('strips an unclosed mermaid block with only the opener present', () => {
    const input = 'Intro paragraph.\n\n```mermaid\n'
    expect(stripStreamingUnclosedMermaid(input)).toBe('Intro paragraph.\n\n')
  })

  it('leaves a trailing unclosed non-mermaid fence alone', () => {
    const input = 'Intro paragraph.\n\n```python\nprint("hello")'
    expect(stripStreamingUnclosedMermaid(input)).toBe(input)
  })

  it('keeps a closed mermaid block when an unclosed python block follows', () => {
    const input = '```mermaid\ngraph TD\nA-->B\n```\n\n```python\nprint(1)'
    expect(stripStreamingUnclosedMermaid(input)).toBe(input)
  })

  it('strips an unclosed mermaid that follows a closed code block', () => {
    const input = '```python\nprint(1)\n```\n\n```mermaid\ngraph TD'
    expect(stripStreamingUnclosedMermaid(input)).toBe('```python\nprint(1)\n```\n\n')
  })

  it('is case-insensitive on the mermaid language tag', () => {
    const input = 'Hello\n\n```Mermaid\ngraph TD'
    expect(stripStreamingUnclosedMermaid(input)).toBe('Hello\n\n')
  })

  it('tolerates up to 3 spaces of fence indent', () => {
    const input = 'Hello\n\n   ```mermaid\ngraph TD'
    expect(stripStreamingUnclosedMermaid(input)).toBe('Hello\n\n')
  })

  it('ignores fences with 4+ spaces of indent (those are indented code blocks)', () => {
    const input = 'Hello\n\n    ```mermaid\ngraph TD'
    expect(stripStreamingUnclosedMermaid(input)).toBe(input)
  })

  it('handles empty input', () => {
    expect(stripStreamingUnclosedMermaid('')).toBe('')
  })
})
