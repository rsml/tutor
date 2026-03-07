import Fastify from 'fastify'
import cors from '@fastify/cors'
import { chatRoutes } from './routes/chat.js'
import { bookRoutes } from './routes/books.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors)
await fastify.register(chatRoutes)
await fastify.register(bookRoutes)

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
