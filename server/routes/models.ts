import type { FastifyInstance } from 'fastify'
import { MODEL_LIST_TIMEOUT_MS } from '../constants.js'
import { providerParamSchema } from '../http/route-params.js'
import { listProviderModels } from '../services/list-provider-models.js'
import type { Ports } from '../composition-root.js'

export async function modelsRoutes(fastify: FastifyInstance, opts: { ports: Ports }) {
  fastify.get<{ Params: { provider: string } }>(
    '/api/providers/:provider/models',
    { schema: { params: providerParamSchema } },
    async (request, reply) => {
      const signal = AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
      const result = await listProviderModels({ keyVault: opts.ports.keyVault }, request.params.provider, signal)
      if (!result.ok) return reply.status(result.status).send({ error: result.error })
      return result.models
    },
  )
}
