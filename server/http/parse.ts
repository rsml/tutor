import type { z } from 'zod'

/**
 * One way to validate a request body.
 *
 * Every route used to wrap `Schema.parse(request.body)` in its own try/catch,
 * check whether the caught error was a Zod validation error, and hand-write
 * the same 400 response. That was repeated about thirty times, and the eight
 * MCP authoring routes forgot the guard entirely, so bad input there
 * surfaced as a 500.
 *
 * Fastify's own ajv `schema.body` validation was considered and rejected. It
 * produces a different 400 payload, which the client already depends on, and
 * it drops the Zod defaults and transforms the handlers rely on, such as
 * `.default([])`.
 */

/**
 * Thrown when a request body does not match its schema. Carries `statusCode`
 * so the error handler needs no special casing, and `issues` so the response
 * can echo them as `details`, exactly as the hand-written blocks did.
 */
export class RequestValidationError extends Error {
  readonly statusCode = 400
  readonly issues: z.core.$ZodIssue[]

  constructor(issues: z.core.$ZodIssue[]) {
    super('Invalid request')
    this.name = 'RequestValidationError'
    this.issues = issues
  }
}

/**
 * Parses a request body, throwing {@link RequestValidationError} on failure.
 * Returns the parsed value, so schema defaults and transforms still apply.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new RequestValidationError(result.error.issues)
  }
  return result.data
}
