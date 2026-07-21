import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../index.js'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { seedBook } from '../test/route-harness.js'
import type { Ports } from '../composition-root.js'

/**
 * Real-socket tests for the chapter-generation SSE routes, covering issue
 * #50, where `POST /api/books/:id/generate-next` answered 200 with an empty
 * body and the reader hung in its generating phase forever.
 *
 * These tests bind a real port and speak HTTP over a real socket instead of
 * using `fastify.inject`, and that is the entire point of the file. The bug
 * lived in a `close` listener on the REQUEST stream, and light-my-request,
 * which backs `inject`, does not model the socket lifecycle that fires it.
 * Every inject-based test in this repo passed straight over the defect. So
 * a test that could actually observe it has to pay for a real listener.
 *
 * Keep these few and fast. Everything that does not specifically depend on
 * socket lifecycle belongs in the far cheaper inject-based suites.
 */

/** Builds a server, binds an ephemeral port, and returns it with its base URL. */
async function listening(overrides: Partial<Ports>): Promise<{ app: FastifyInstance; base: string }> {
  const app = await buildServer(overrides)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return { app, base: `http://127.0.0.1:${port}` }
}

function postJson(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

describe('chapter generation SSE over a real socket', () => {
  it('streams chapter events from generate-next rather than closing before the first byte', async () => {
    const meta = await seedBook({ totalChapters: 3, generatedUpTo: 1 })
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptStreamText(['alpha ', 'beta'])
    // Quiz generation is a non-fatal side effect of generating a chapter.
    textGeneration.scriptGenerateObject({ questions: [] })

    const { app, base } = await listening({ textGeneration })
    try {
      const res = await fetch(`${base}/api/books/${meta.id}/generate-next`, postJson({ model: 'claude-sonnet-4-6' }))
      expect(res.status).toBe(200)

      const body = await res.text()
      // The regression this pins: the body was empty. Assert on real
      // content rather than merely on length, so a future change that
      // writes a byte but drops the events still fails here.
      expect(body).not.toBe('')
      expect(body).toContain('alpha')
      expect(body).toContain('beta')
    } finally {
      await app.close()
    }
  })

  it('streams chapter events from regenerate too, which only ever worked by accident', async () => {
    // Before the fix this route passed while generate-next failed, and the
    // difference was not intentional. Its handler is `async` and awaits
    // getBook() before reaching the SSE helper, so the request stream's
    // premature `close` fired during that await, before the listener was
    // attached, and was therefore missed. generate-next's handler is
    // synchronous, attaches in the same tick, and caught it. Removing an
    // await here would have silently broken this route. This test exists so
    // that the route's correctness stops depending on that timing.
    const meta = await seedBook({ totalChapters: 3, generatedUpTo: 2 })
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptStreamText(['redone'])
    textGeneration.scriptGenerateObject({ questions: [] })

    const { app, base } = await listening({ textGeneration })
    try {
      const res = await fetch(`${base}/api/books/${meta.id}/chapters/1/regenerate`, postJson({ model: 'claude-sonnet-4-6' }))
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('redone')
    } finally {
      await app.close()
    }
  })
})
