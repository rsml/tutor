import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseBody, RequestValidationError } from './parse.js'

/**
 * parseBody replaces roughly thirty hand-written try/catch blocks that each
 * did the same thing. The exact 400 body those blocks produced is a published
 * contract the client reads, so these tests pin it rather than describe it.
 */

const Schema = z.object({
  topic: z.string().min(1),
  count: z.number().int().optional(),
  tags: z.array(z.string()).default([]),
})

describe('parseBody', () => {
  it('returns the parsed value when the body is valid', () => {
    expect(parseBody(Schema, { topic: 'effect', count: 3 })).toEqual({
      topic: 'effect',
      count: 3,
      tags: [],
    })
  })

  it('applies schema defaults, which Fastify ajv validation would not', () => {
    // This is why the refactor keeps Zod rather than moving to ajv `schema.body`.
    expect(parseBody(Schema, { topic: 'effect' }).tags).toEqual([])
  })

  it('throws RequestValidationError rather than ZodError', () => {
    expect(() => parseBody(Schema, {})).toThrow(RequestValidationError)
  })

  it('carries statusCode 400 so the error handler needs no special casing', () => {
    try {
      parseBody(Schema, {})
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as RequestValidationError).statusCode).toBe(400)
    }
  })

  it('exposes the Zod issues verbatim, which the 400 body echoes as `details`', () => {
    try {
      parseBody(Schema, { topic: '' })
      expect.unreachable('should have thrown')
    } catch (err) {
      const issues = (err as RequestValidationError).issues
      expect(Array.isArray(issues)).toBe(true)
      expect(issues.length).toBeGreaterThan(0)
      expect(issues[0]).toHaveProperty('path')
      expect(issues[0]).toHaveProperty('message')
    }
  })

  it('uses the message the routes previously sent, so the body is unchanged', () => {
    try {
      parseBody(Schema, {})
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as Error).message).toBe('Invalid request')
    }
  })

  it('rejects a null or undefined body the same way as a malformed one', () => {
    expect(() => parseBody(Schema, null)).toThrow(RequestValidationError)
    expect(() => parseBody(Schema, undefined)).toThrow(RequestValidationError)
  })
})
