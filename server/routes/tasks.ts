import type { FastifyInstance } from 'fastify'
import * as taskManager from '../services/task-manager.js'

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks', async () => {
    return taskManager.listTasks()
  })

  fastify.get('/api/tasks/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    // Send current tasks as initial state
    const currentTasks = taskManager.listTasks()
    for (const task of currentTasks) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'task_created', task })}\n\n`)
    }

    let ended = false
    const unsubscribe = taskManager.subscribeGlobal((event) => {
      if (ended) return
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    request.raw.on('close', () => {
      unsubscribe()
      if (!ended) { ended = true; reply.raw.end() }
    })
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
      const success = taskManager.cancelTask(request.params.taskId)
      if (!success) {
        return reply.status(404).send({ error: 'Task not found or not cancellable' })
      }
      return { ok: true }
    },
  )
}
