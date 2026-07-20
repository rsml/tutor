import { describe, it, expect } from 'vitest'
import { toErrorResponse } from './error-handler.js'
import { RequestValidationError } from './parse.js'

/**
 * The error handler is expressed as a pure function so its behaviour can be
 * pinned without booting a server.
 *
 * Context: until this phase the handler was registered AFTER every route
 * plugin had been awaited, so it never applied to any route and every error
 * fell through to Fastify's default handler. Phase 0's characterization tests
 * recorded that broken behaviour deliberately. These tests describe the
 * intended behaviour that registering it correctly now delivers.
 */

describe('toErrorResponse', () => {
  it('renders a validation failure as the exact body the routes used to send', () => {
    const issues = [{ code: 'custom' as const, path: ['topic'], message: 'Required' }]
    const res = toErrorResponse(new RequestValidationError(issues))
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid request', details: issues })
    expect(res.logAsServerError).toBe(false)
  })

  it('turns a missing file into a 404 without echoing the path', () => {
    const err = Object.assign(
      new Error("ENOENT: no such file or directory, open '/Users/someone/Library/tutor/books/abc/meta.yml'"),
      { code: 'ENOENT' },
    )
    const res = toErrorResponse(err)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
    // The whole point: no filesystem path may reach the client.
    expect(JSON.stringify(res.body)).not.toContain('/Users/')
    expect(JSON.stringify(res.body)).not.toContain('meta.yml')
  })

  it('passes through a deliberate client error using its own message', () => {
    const err = Object.assign(new Error('Chapter 99 out of range (1-12)'), { statusCode: 400 })
    const res = toErrorResponse(err)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Chapter 99 out of range (1-12)' })
    expect(res.logAsServerError).toBe(false)
  })

  it('preserves other 4xx codes such as a conflict', () => {
    const err = Object.assign(new Error('Book is generating'), { statusCode: 409 })
    expect(toErrorResponse(err)).toMatchObject({ status: 409, body: { error: 'Book is generating' } })
  })

  it('hides the detail of an unexpected server error and flags it for logging', () => {
    const res = toErrorResponse(new Error('connection string user:hunter2@db failed'))
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
    expect(JSON.stringify(res.body)).not.toContain('hunter2')
    expect(res.logAsServerError).toBe(true)
  })

  it('treats an explicit 5xx statusCode as a server error too', () => {
    const err = Object.assign(new Error('upstream exploded'), { statusCode: 502 })
    const res = toErrorResponse(err)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
    expect(res.logAsServerError).toBe(true)
  })

  it('falls back to a generic message when a client error carries none', () => {
    const err = Object.assign(new Error(''), { statusCode: 400 })
    expect(toErrorResponse(err).body).toEqual({ error: 'Internal server error' })
  })

  it('checks ENOENT before statusCode, so a tagged ENOENT still 404s', () => {
    const err = Object.assign(new Error('nope'), { code: 'ENOENT', statusCode: 500 })
    expect(toErrorResponse(err).status).toBe(404)
  })
})
