import { describe, expect, it } from 'vitest'
import { sanitizeFeedback } from './sanitize.js'

describe('sanitizeFeedback', () => {
  it('passes plain prose through untouched', () => {
    expect(sanitizeFeedback('loved the pacing, more examples please')).toBe(
      'loved the pacing, more examples please'
    )
  })

  it('strips opening, closing, and self-closing tags', () => {
    expect(sanitizeFeedback('before <b>bold</b> and <br/> after')).toBe('before bold and  after')
  })

  it('strips a tag that would close a prompt wrapper early', () => {
    expect(sanitizeFeedback('sneaky </reader_liked> escape')).toBe('sneaky  escape')
  })

  it('strips angle-bracket component names too, the documented blunt-regex trade-off', () => {
    expect(sanitizeFeedback('render a <Component> here')).toBe('render a  here')
  })

  it('leaves a lone angle bracket with no closing bracket alone', () => {
    expect(sanitizeFeedback('3 < 5 is true')).toBe('3 < 5 is true')
  })

  it('returns the empty string unchanged', () => {
    expect(sanitizeFeedback('')).toBe('')
  })
})
