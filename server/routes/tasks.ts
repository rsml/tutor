import type { FastifyInstance } from 'fastify'
import type { Ports, SharedServices } from '../composition-root.js'

export async function taskRoutes(fastify: FastifyInstance, opts: { ports: Ports; services: SharedServices }) {
  const { ports } = opts

  fastify.get('/api/tasks', async () => {
    return ports.backgroundTasks.list()
  })

  fastify.get('/api/tasks/stream', async (request, reply) => {
    try {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      // Send current tasks as initial state
      const currentTasks = ports.backgroundTasks.list()
      for (const task of currentTasks) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'task_created', task })}\n\n`)
      }

      let ended = false
      const unsubscribe = ports.backgroundTasks.subscribe((event) => {
        if (ended) return
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      })

      // Listen on the RESPONSE, never on the request, for the reason issue
      // #50 documents at length in server/routes/generation.ts. This route
      // is a GET whose body Fastify never reads, so its request stream is
      // not finished early and the old listener happened not to misfire,
      // which is why the task tray worked while chapter generation did not.
      // That is a coincidence of the verb, not a property worth relying on,
      // and this is the stream resumed jobs are reported through, so it gets
      // the same correct listener rather than the same latent trap.
      reply.raw.on('close', () => {
        unsubscribe()
        if (!ended) { ended = true; reply.raw.end() }
      })
    } catch (err) {
      console.error('[GET /api/tasks/stream] SSE setup failed:', err)
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: 'Stream setup failed' })
      }
    }
  })

  fastify.delete<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { taskId: { type: 'string' } },
          required: ['taskId'],
        },
      },
    },
    async (request, reply) => {
      const success = ports.backgroundTasks.cancel(request.params.taskId)
      if (!success) {
        return reply.status(404).send({ error: 'Task not found or not cancellable' })
      }
      return { ok: true }
    },
  )
}
