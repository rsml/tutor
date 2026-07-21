import { describe, it, expect } from 'vitest'
import { audiobookFileUrl, coverUrl, voicePreviewUrl } from './urls'

/**
 * These URLs are handed to an img tag or an Audio element rather than to
 * fetch, so they are the one place the client still builds a URL by hand. The
 * version tag is the interesting part. Covers and audiobooks are overwritten
 * in place, so without it the browser keeps serving the old bytes after a
 * regeneration.
 */

describe('coverUrl', () => {
  it('tags the cover with the time it last changed', () => {
    expect(coverUrl({ id: 'ada', coverUpdatedAt: '2026-01-02T03:04:05Z' }))
      .toBe('/api/books/ada/cover?v=2026-01-02T03:04:05Z')
  })

  it('still answers for a book that has never had its cover replaced', () => {
    expect(coverUrl({ id: 'ada' })).toBe('/api/books/ada/cover?v=')
  })
})

describe('audiobookFileUrl', () => {
  it('tags the file with the time it was generated', () => {
    expect(audiobookFileUrl('ada', '2026-01-02T03:04:05Z'))
      .toBe('/api/books/ada/audiobook/file?v=2026-01-02T03%3A04%3A05Z')
  })

  it('omits the tag entirely when nothing has been generated yet', () => {
    expect(audiobookFileUrl('ada')).toBe('/api/books/ada/audiobook/file')
  })
})

describe('voicePreviewUrl', () => {
  it('addresses a voice sample by id', () => {
    expect(voicePreviewUrl('am_michael')).toBe('/api/audiobook/voices/am_michael/preview')
  })
})
