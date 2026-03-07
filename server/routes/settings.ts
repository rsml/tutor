import type { FastifyInstance } from 'fastify'
import { SetApiKeyBodySchema, RemoveApiKeyBodySchema } from '../schemas.js'
import { setKey, removeKey, keyStatus } from '../services/key-store.js'
import { ZodError } from 'zod'

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { provider: string; apiKey: string } }>(
    '/api/settings/api-key',
    async (request, reply) => {
      try {
        const body = SetApiKeyBodySchema.parse(request.body)
        setKey(body.provider, body.apiKey)
        return { ok: true }
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }
    },
  )

  fastify.delete<{ Body: { provider: string } }>(
    '/api/settings/api-key',
    async (request, reply) => {
      try {
        const body = RemoveApiKeyBodySchema.parse(request.body)
        removeKey(body.provider)
        return { ok: true }
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }
    },
  )

  fastify.get('/api/settings/api-key-status', async () => {
    return keyStatus()
  })
}
