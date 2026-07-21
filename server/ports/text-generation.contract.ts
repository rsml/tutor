import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { TextChunk } from './text-generation.js'
import type { FakeTextGeneration } from './text-generation.fake.js'

/**
 * The TextGeneration contract. Fake-only: every subject exercised here is an
 * in-memory script, because a real subject would spend money against a live
 * provider, so no adapter is ever wired into this contract.
 *
 * `makeSubject` is typed to the fake's own shape rather than the bare
 * `TextGeneration` port, because two of the behaviours this contract must
 * pin, that scripted responses arrive in order and that the fake records
 * what it was asked, are only observable through the fake's scripting and
 * recording surface. There is no plain-port way to express either, and
 * because this port never gets a real adapter, there is no future subject
 * that would need the narrower type.
 */

/**
 * The extra scripting surface the failure taxonomy block below needs, kept
 * as its own local type instead of added to FakeTextGeneration itself.
 * FakeTextGeneration is not guaranteed to grow these two methods, so this
 * contract detects them structurally at runtime, `'scriptFailure' in
 * subject`, and this type only describes what that detection unlocks once
 * it succeeds.
 */
interface FailureScriptable {
  scriptFailure(error: unknown): void
  scriptStreamFailure(error: unknown, opts?: { afterChunks?: string[] }): void
}

function canScriptFailures(subject: FakeTextGeneration): subject is FakeTextGeneration & FailureScriptable {
  return 'scriptFailure' in subject && 'scriptStreamFailure' in subject
}

export function describeTextGenerationContract(
  label: string,
  makeSubject: () => FakeTextGeneration | Promise<FakeTextGeneration>,
): void {
  const model = { provider: 'anthropic', model: 'claude-test' } as const

  describe(`TextGeneration contract (${label})`, () => {
    describe('streamText', () => {
      it('yields the scripted chunks in order', async () => {
        const textGen = await makeSubject()
        textGen.scriptStreamText(['Once ', 'upon ', 'a time.'])

        const received: string[] = []
        for await (const chunk of textGen.streamText({ model, prompt: 'Tell a story' })) {
          received.push(chunk)
        }

        expect(received).toEqual(['Once ', 'upon ', 'a time.'])
      })

      it('stops the stream when the signal is aborted mid-stream', async () => {
        const textGen = await makeSubject()
        textGen.scriptStreamText(['first', 'second', 'third'])
        const controller = new AbortController()

        const received: string[] = []
        await expect((async () => {
          for await (const chunk of textGen.streamText({ model, prompt: 'x', signal: controller.signal })) {
            received.push(chunk)
            if (received.length === 1) controller.abort()
          }
        })()).rejects.toThrow()

        expect(received).toEqual(['first'])
      })

      it('records the request, so a caller can assert what prompt was sent', async () => {
        const textGen = await makeSubject()
        textGen.scriptStreamText(['ok'])

        for await (const _chunk of textGen.streamText({
          model,
          system: 'Be terse.',
          prompt: 'Reader profile: likes brevity. Write a chapter.',
        })) { /* drain */ }

        expect(textGen.requests.streamText).toHaveLength(1)
        expect(textGen.requests.streamText[0].prompt).toContain('likes brevity')
        expect(textGen.requests.streamText[0].system).toBe('Be terse.')
      })
    })

    describe('generateObject', () => {
      const schema = z.object({ questions: z.array(z.string()) })

      it('returns a value satisfying the given schema', async () => {
        const textGen = await makeSubject()
        textGen.scriptGenerateObject({ questions: ['What is 2+2?'] })

        const result = await textGen.generateObject({ model, schema, prompt: 'Write one quiz question' })

        expect(schema.safeParse(result).success).toBe(true)
        expect(result.questions).toEqual(['What is 2+2?'])
      })

      it('rejects when the scripted value does not satisfy the schema', async () => {
        const textGen = await makeSubject()
        textGen.scriptGenerateObject({ questions: 'not an array' })

        await expect(textGen.generateObject({ model, schema, prompt: 'x' })).rejects.toThrow()
      })

      it('records the request, so a caller can assert what prompt was sent', async () => {
        const textGen = await makeSubject()
        textGen.scriptGenerateObject({ questions: [] })

        await textGen.generateObject({ model, schema, prompt: 'Reader profile: likes code examples' })

        expect(textGen.requests.generateObject[0].prompt).toContain('likes code examples')
      })

      it('rejects immediately when the signal is already aborted', async () => {
        const textGen = await makeSubject()
        textGen.scriptGenerateObject({ questions: [] })
        const controller = new AbortController()
        controller.abort()

        await expect(
          textGen.generateObject({ model, schema, prompt: 'x', signal: controller.signal }),
        ).rejects.toThrow()
      })
    })

    describe('runToolConversation', () => {
      it('yields scripted text chunks in order', async () => {
        const textGen = await makeSubject()
        textGen.scriptToolConversation([
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'there' },
        ])

        const received: string[] = []
        for await (const part of textGen.runToolConversation({ model, system: 'sys', messages: [], tools: {}, maxSteps: 2 })) {
          received.push(part.text)
        }

        expect(received).toEqual(['Hello', 'there'])
      })

      it('invokes the requested tool with schema-validated input, so its side effects run, and never surfaces the call on the iterable', async () => {
        const textGen = await makeSubject()
        const calls: Array<{ name: string }> = []
        textGen.scriptToolConversation([{ type: 'tool-call', tool: 'save_profile', input: { name: 'Ross' } }])

        const parts: TextChunk[] = []
        for await (const part of textGen.runToolConversation({
          model,
          system: 'sys',
          messages: [],
          maxSteps: 2,
          tools: {
            save_profile: {
              description: 'Saves the profile',
              inputSchema: z.object({ name: z.string() }),
              execute: async (input: { name: string }) => {
                calls.push({ name: input.name })
                return 'saved'
              },
            },
          },
        })) {
          parts.push(part)
        }

        expect(calls).toEqual([{ name: 'Ross' }])
        expect(parts).toEqual([])
      })

      it('stops after maxSteps scripted steps even when more are scripted', async () => {
        const textGen = await makeSubject()
        textGen.scriptToolConversation([
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
          { type: 'text', text: 'three' },
        ])

        const received: string[] = []
        for await (const part of textGen.runToolConversation({ model, system: 'sys', messages: [], tools: {}, maxSteps: 2 })) {
          received.push(part.text)
        }

        expect(received).toEqual(['one', 'two'])
      })

      it('stops the stream when the signal is aborted mid-conversation', async () => {
        const textGen = await makeSubject()
        textGen.scriptToolConversation([
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
        ])
        const controller = new AbortController()

        const received: string[] = []
        await expect((async () => {
          for await (const part of textGen.runToolConversation({
            model,
            system: 'sys',
            messages: [],
            tools: {},
            maxSteps: 5,
            signal: controller.signal,
          })) {
            received.push(part.text)
            if (received.length === 1) controller.abort()
          }
        })()).rejects.toThrow()

        expect(received).toEqual(['one'])
      })

      it('records the request, so a caller can assert what the conversation contained', async () => {
        const textGen = await makeSubject()
        textGen.scriptToolConversation([{ type: 'text', text: 'ok' }])

        for await (const _part of textGen.runToolConversation({
          model,
          system: 'Interview the reader.',
          messages: [{ role: 'user', content: 'I like code examples' }],
          tools: {},
          maxSteps: 2,
        })) { /* drain */ }

        expect(textGen.requests.runToolConversation[0].messages).toEqual([{ role: 'user', content: 'I like code examples' }])
        expect(textGen.requests.runToolConversation[0].system).toBe('Interview the reader.')
      })
    })

    describe('failure taxonomy', () => {
      const schema = z.object({ questions: z.array(z.string()) })

      it('propagates a scripted failure out of generateObject with its kind, reason, and retryable intact', async () => {
        const textGen = await makeSubject()
        if (!canScriptFailures(textGen)) return // this subject carries no failure injection surface, see FailureScriptable above

        const scripted = { name: 'TextGenerationError', message: 'rate limited', kind: 'rate-limited', reason: 'rate limited', retryable: true }
        textGen.scriptFailure(scripted)

        await expect(textGen.generateObject({ model, schema, prompt: 'x' })).rejects.toMatchObject({
          kind: 'rate-limited',
          reason: 'rate limited',
          retryable: true,
        })
      })

      it('rejects on the first iteration when a scripted stream failure has no chunks before it', async () => {
        const textGen = await makeSubject()
        if (!canScriptFailures(textGen)) return

        const scripted = { name: 'TextGenerationError', message: 'boom', kind: 'unknown', reason: 'boom', retryable: false }
        textGen.scriptStreamFailure(scripted, { afterChunks: [] })

        const iterator = textGen.streamText({ model, prompt: 'x' })[Symbol.asyncIterator]()
        await expect(iterator.next()).rejects.toMatchObject({ kind: 'unknown' })
      })

      it('yields every chunk scripted before a stream failure, then throws, with no chunk duplicated', async () => {
        const textGen = await makeSubject()
        if (!canScriptFailures(textGen)) return

        const scripted = { name: 'TextGenerationError', message: 'overloaded', kind: 'overloaded', reason: 'overloaded', retryable: true }
        textGen.scriptStreamFailure(scripted, { afterChunks: ['a', 'b'] })

        const received: string[] = []
        await expect((async () => {
          for await (const chunk of textGen.streamText({ model, prompt: 'x' })) {
            received.push(chunk)
          }
        })()).rejects.toMatchObject({ kind: 'overloaded' })

        expect(received).toEqual(['a', 'b'])
      })
    })
  })
}
