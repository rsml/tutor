import { describe, it, expect } from 'vitest'
import { stripMarkdownForNarration } from './markdown-to-narration.js'

describe('stripMarkdownForNarration', () => {
  it('returns empty string for empty input', () => {
    expect(stripMarkdownForNarration('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(stripMarkdownForNarration('   \n\n  \t  \n')).toBe('')
  })

  it('passes plain paragraph through unchanged', () => {
    const input = 'Hello world. This is a sentence.'
    expect(stripMarkdownForNarration(input)).toBe('Hello world. This is a sentence.')
  })

  it('separates two paragraphs by exactly one blank line', () => {
    const input = 'First paragraph.\n\n\n\nSecond paragraph.'
    expect(stripMarkdownForNarration(input)).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('removes images entirely', () => {
    const input = 'Look ![cat](cat.jpg) here.'
    expect(stripMarkdownForNarration(input)).toBe('Look  here.')
  })

  it('removes fenced code blocks entirely', () => {
    const input = 'Before.\n\n```js\nconst x = 1\nconsole.log(x)\n```\n\nAfter.'
    expect(stripMarkdownForNarration(input)).toBe('Before.\n\nAfter.')
  })

  it('removes tilde-fenced code blocks entirely', () => {
    const input = 'Before.\n\n~~~\nfoo\n~~~\n\nAfter.'
    expect(stripMarkdownForNarration(input)).toBe('Before.\n\nAfter.')
  })

  it('keeps inline code content without backticks', () => {
    const input = 'Use the `foo()` function.'
    expect(stripMarkdownForNarration(input)).toBe('Use the foo() function.')
  })

  it('converts links to their text', () => {
    const input = 'Please [click here](https://example.com) now.'
    expect(stripMarkdownForNarration(input)).toBe('Please click here now.')
  })

  it('converts heading to prose ending with a period', () => {
    const input = '# Chapter One: Introduction\n\nBody text.'
    const result = stripMarkdownForNarration(input)
    expect(result).toBe('Chapter One: Introduction.\n\nBody text.')
  })

  it('does not add a redundant period to a heading already ending in punctuation', () => {
    expect(stripMarkdownForNarration('## Is this working?')).toBe('Is this working?')
    expect(stripMarkdownForNarration('### Wow!')).toBe('Wow!')
    expect(stripMarkdownForNarration('# Done.')).toBe('Done.')
  })

  it('handles multiple heading levels', () => {
    const input = '# H1\n\n## H2\n\n### H3'
    expect(stripMarkdownForNarration(input)).toBe('H1.\n\nH2.\n\nH3.')
  })

  it('strips bullet markers from list items and adds periods so Kokoro splits each item as a separate sentence', () => {
    const input = '- one\n- two\n- three'
    expect(stripMarkdownForNarration(input)).toBe('one.\ntwo.\nthree.')
  })

  it('strips numbered list markers and adds periods', () => {
    const input = '1. first\n2. second\n3. third'
    expect(stripMarkdownForNarration(input)).toBe('first.\nsecond.\nthird.')
  })

  it('strips asterisk list markers and adds periods', () => {
    const input = '* alpha\n* beta'
    expect(stripMarkdownForNarration(input)).toBe('alpha.\nbeta.')
  })

  it('does not double-punctuate list items that already end in sentence punctuation', () => {
    const input = '- already done.\n- a question?\n- exclamation!'
    expect(stripMarkdownForNarration(input)).toBe('already done.\na question?\nexclamation!')
  })

  it('converts a table to comma-separated sentences', () => {
    const input = '| Name | Age |\n|------|-----|\n| Bob  | 30  |\n| Sue  | 25  |'
    const result = stripMarkdownForNarration(input)
    expect(result).toBe('Name: Bob, Age: 30.\nName: Sue, Age: 25.')
  })

  it('converts a blockquote to inline text', () => {
    const input = '> This is a quote.'
    expect(stripMarkdownForNarration(input)).toBe('This is a quote.')
  })

  it('strips single asterisk emphasis markers', () => {
    expect(stripMarkdownForNarration('*hello*')).toBe('hello')
  })

  it('strips double asterisk bold markers', () => {
    expect(stripMarkdownForNarration('**bold**')).toBe('bold')
  })

  it('strips underscore emphasis markers', () => {
    expect(stripMarkdownForNarration('_italic_ and __strong__')).toBe('italic and strong')
  })

  it('handles nested emphasis', () => {
    expect(stripMarkdownForNarration('**bold and *italic* together**')).toBe('bold and italic together')
  })

  it('removes footnote markers', () => {
    const input = 'A claim[^1] with a footnote.'
    expect(stripMarkdownForNarration(input)).toBe('A claim with a footnote.')
  })

  it('strips HTML tags but keeps inner text', () => {
    expect(stripMarkdownForNarration('<span>foo</span>')).toBe('foo')
    expect(stripMarkdownForNarration('A <strong>bold</strong> claim.')).toBe('A bold claim.')
  })

  it('strips self-closing and attribute-bearing HTML tags', () => {
    expect(stripMarkdownForNarration('Line<br/>break')).toBe('Linebreak')
    expect(stripMarkdownForNarration('<a href="x">text</a>')).toBe('text')
  })

  it('removes horizontal rules', () => {
    const input = 'Above\n\n---\n\nBelow'
    expect(stripMarkdownForNarration(input)).toBe('Above\n\nBelow')
  })

  it('handles a complex document end-to-end', () => {
    const input = [
      '# Introduction',
      '',
      'This is a **bold** statement with `code` and a [link](https://x.com).',
      '',
      '![alt text](img.png)',
      '',
      '## Steps',
      '',
      '- First step',
      '- Second step',
      '',
      '```python',
      'print("hi")',
      '```',
      '',
      '> Wise words.',
    ].join('\n')

    const result = stripMarkdownForNarration(input)
    expect(result).toBe(
      [
        'Introduction.',
        '',
        'This is a bold statement with code and a link.',
        '',
        'Steps.',
        '',
        'First step.',
        'Second step.',
        '',
        'Wise words.',
      ].join('\n'),
    )
  })
})
