import type { FastifyInstance } from 'fastify'
import { RequestValidationError } from './parse.js'
import { SchemaTooNewError } from '@shared/schema-version.js'
import { TextGenerationError } from '../ports/text-generation.js'
import type { AiErrorKind } from '@shared/responses.js'

/**
 * The single place an error becomes a response.
 *
 * This handler existed before but never ran. It was registered on the root
 * instance AFTER every route plugin had already been awaited through
 * `register()`, and Fastify only propagates an error handler to child
 * encapsulation contexts created after it is set. So every route booted
 * against Fastify's default handler instead, which meant a missing book
 * returned 500 with an absolute filesystem path in the message rather than a
 * clean 404. Registering it ahead of the route plugins is the fix.
 */

/** What the client receives, plus whether the server should log it as a fault. */
export interface ErrorResponse {
  status: number
  body: { error: string; details?: unknown; kind?: AiErrorKind }
  logAsServerError: boolean
}

type AppError = Error & { code?: string; statusCode?: number }

/**
 * Pure mapping from a thrown error to a response, kept separate from Fastify
 * so it can be unit tested without booting a server.
 *
 * Order matters. ENOENT is checked before `statusCode` so a missing file 404s
 * even when something upstream tagged it 500.
 */
export function toErrorResponse(error: AppError): ErrorResponse {
  if (error instanceof RequestValidationError) {
    return {
      status: 400,
      body: { error: 'Invalid request', details: error.issues },
      logAsServerError: false,
    }
  }

  // Never echo the message here. It contains the absolute path of the file
  // that was missing, which is exactly what leaked before this was fixed.
  if (error.code === 'ENOENT') {
    return { status: 404, body: { error: 'Not found' }, logAsServerError: false }
  }

  // A library written by a newer build. 409 rather than 500, because the
  // server is fine and the data is simply from the future, and it is not
  // retryable. The body is rebuilt from `found` and `supported` instead of
  // echoing error.message, for the same reason ENOENT above does not echo
  // its own: the message embeds the absolute path of the offending file.
  // The path still reaches the log, where it is useful and not exposed.
  if (error instanceof SchemaTooNewError) {
    return {
      status: 409,
      body: {
        error: `This library was written by a newer version of Tutor (data version ${error.found}, this build supports up to ${error.supported}). Update the app to open it.`,
      },
      logAsServerError: false,
    }
  }

  // An AI provider failure that the adapter already classified. The class
  // travels to the client as `kind` so the reader can act on it, most
  // usefully by opening the missing-key dialog on auth-failed instead of
  // showing a toast the user has no way to resolve. `reason` is written to
  // be safe to display, unlike a raw provider message.
  if (error instanceof TextGenerationError) {
    return {
      status: error.kind === 'auth-failed' ? 401 : error.retryable ? 503 : 502,
      body: { error: error.reason, kind: error.kind },
      logAsServerError: false,
    }
  }

  const statusCode = error.statusCode ?? 500

  // An unexpected failure may carry anything in its message, including
  // credentials from a connection string, so the client gets a generic body
  // and the detail goes to the log instead.
  if (statusCode >= 500) {
    return { status: 500, body: { error: 'Internal server error' }, logAsServerError: true }
  }

  return {
    status: statusCode,
    body: { error: error.message || 'Internal server error' },
    logAsServerError: false,
  }
}

/**
 * Registers the handler. MUST be called before any route plugin is registered,
 * otherwise the plugins inherit Fastify's default handler and this one never
 * runs. See the note at the top of this file.
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: AppError, request, reply) => {
    const { status, body, logAsServerError } = toErrorResponse(error)
    if (logAsServerError) {
      fastify.log.error(
        { err: error, req: { method: request.method, url: request.url } },
        'Unhandled server error',
      )
    }
    return reply.status(status).send(body)
  })
}
