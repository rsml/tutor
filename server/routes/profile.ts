import type { FastifyInstance } from 'fastify'
import { UpdateProfileBodySchema, InterviewChatBodySchema, SuggestSkillsBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { getProfile } from '../services/get-profile.js'
import { saveProfile } from '../services/save-profile.js'
import { suggestSkills } from '../services/suggest-skills.js'
import { interviewProfile } from '../services/interview-profile.js'
import type { Ports } from '../composition-root.js'

export async function profileRoutes(fastify: FastifyInstance, opts: { ports: Ports }) {
  const { ports } = opts

  fastify.get('/api/profile', async () => {
    return getProfile({ bookRepository: ports.bookRepository })
  })

  fastify.put<{ Body: unknown }>('/api/profile', async (request) => {
    const body = parseBody(UpdateProfileBodySchema, request.body)
    await saveProfile({ bookRepository: ports.bookRepository }, body)
    return { ok: true }
  })

  fastify.post<{ Body: unknown }>('/api/profile/suggest-skills', async (request) => {
    const body = parseBody(SuggestSkillsBodySchema, request.body)
    return suggestSkills({ textGeneration: ports.textGeneration }, body)
  })

  fastify.post<{ Body: unknown }>('/api/profile/interview', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseBody(InterviewChatBodySchema, request.body)

    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const sendLine = (data: Record<string, unknown>) => {
      reply.raw.write(JSON.stringify(data) + '\n')
    }

    try {
      await interviewProfile(
        { textGeneration: ports.textGeneration, bookRepository: ports.bookRepository },
        body,
        sendLine,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        sendLine({ type: 'error', message: (err as Error).message || 'Interview failed' })
      }
    } finally {
      reply.raw.end()
    }
  })
}
