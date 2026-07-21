import type { FastifyInstance } from 'fastify'
import { SetApiKeyBodySchema, RemoveApiKeyBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import type { Ports } from '../composition-root.js'

export async function settingsRoutes(fastify: FastifyInstance, opts: { ports: Ports }) {
  const { ports } = opts

  fastify.post<{ Body: unknown }>('/api/settings/api-key', async (request) => {
    const body = parseBody(SetApiKeyBodySchema, request.body)
    ports.keyVault.set(body.provider, body.apiKey)
    return { ok: true }
  })

  fastify.delete<{ Body: unknown }>('/api/settings/api-key', async (request) => {
    const body = parseBody(RemoveApiKeyBodySchema, request.body)
    ports.keyVault.remove(body.provider)
    return { ok: true }
  })

  fastify.get('/api/settings/api-key-status', async () => {
    return ports.keyVault.status()
  })
}
