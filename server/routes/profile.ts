import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import * as store from '../services/book-store.js'
import { UpdateProfileBodySchema } from '../schemas.js'

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.get('/api/profile', async () => {
    const profile = await store.getProfile()
    const aboutMe = [profile.identity, profile.style].filter(Boolean).join('\n\n')
    return { aboutMe, preferences: profile.preferences }
  })

  fastify.put<{ Body: unknown }>('/api/profile', async (request, reply) => {
    try {
      const body = UpdateProfileBodySchema.parse(request.body)
      await store.saveProfile({
        identity: body.aboutMe,
        style: '',
        preferences: body.preferences,
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }
  })
}
