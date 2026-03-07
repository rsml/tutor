import Fastify from 'fastify'
import cors from '@fastify/cors'
import { chatRoutes } from './routes/chat.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors)
await fastify.register(chatRoutes)

fastify.get('/api/health', async () => ({ status: 'ok' }))

const start = async () => {
  try {
    await fastify.listen({ port: 3147 })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
