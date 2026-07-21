import { PROVIDERS } from '@shared/provider.js'

/**
 * Fastify JSON-schema fragments for route `:params`, shared by every route
 * file that needs them. Before this module, `books.ts` and `covers.ts` each
 * hand-rolled an identical book-id schema, and `models.ts` restated the
 * provider list as a separate regex literal.
 *
 * The book id and chapter patterns must stay byte-identical to what shipped
 * before — the Phase 0 characterization tests assert the exact 400 responses
 * they produce for malformed params.
 */

/** Matches a route `:id` that must be a book id, e.g. `/api/books/:id`. */
export const bookIdSchema = {
  type: 'object' as const,
  properties: { id: { type: 'string' as const, pattern: '^[a-z0-9-]{1,50}$' } },
  required: ['id'] as const,
}

/** Matches a route with both a book `:id` and a chapter `:num`, e.g. `/api/books/:id/chapters/:num`. */
export const bookChapterSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, pattern: '^[a-z0-9-]{1,50}$' },
    num: { type: 'string' as const, pattern: '^[1-9][0-9]{0,2}$' },
  },
  required: ['id', 'num'] as const,
}

/**
 * Matches a route `:provider` that must be one of the known AI providers.
 * Built from the shared provider list rather than a restated regex literal,
 * so a provider added to `shared/provider.ts` doesn't also need updating
 * here.
 */
export const providerParamSchema = {
  type: 'object' as const,
  properties: { provider: { type: 'string' as const, pattern: `^(${PROVIDERS.join('|')})$` } },
  required: ['provider'] as const,
}
