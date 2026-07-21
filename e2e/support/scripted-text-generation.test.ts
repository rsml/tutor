import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { describeTextGenerationContract } from '@server/ports/text-generation.contract.js'
import {
  allOf,
  createScriptedTextGeneration,
  promptIncludes,
  schemaNamed,
  systemIncludes,
} from './scripted-text-generation.js'

/**
 * The fidelity guarantee for the journey suite's model.
 *
 * The journeys are only worth anything if the object standing in for the AI
 * provider behaves like the port says a TextGeneration behaves. So the same
 * contract Phase 2 wrote for its own fake runs against this adapter, with no
 * exemptions: cancellation mid-stream, schema validation of every generated
 * object, request recording, and the tool conversation's step limit.
 *
 * The contract exercises the first-in first-out surface, because that is
 * what it was written against. The rule surface this adapter adds on top is
 * covered by the block below it, and the two together are what the journeys
 * actually lean on.
 *
 * This file is a vitest test rather than a Playwright journey on purpose. It
 * needs no browser and no server, so it belongs in the fast suite, which is
 * why `vitest.config.ts` excludes only `e2e/**` + '/*.spec.ts' rather than
 * all of `e2e/`.
 */
describeTextGenerationContract('scripted (e2e)', () => createScriptedTextGeneration())

describe('scripted TextGeneration rules', () => {
  const model = { provider: 'anthropic', model: 'claude-test' } as const

  async function drain(stream: AsyncIterable<string>): Promise<string> {
    let text = ''
    for await (const chunk of stream) text += chunk
    return text
  }

  it('answers a streamText call from the rule whose matcher fits, regardless of call order', async () => {
    const ai = createScriptedTextGeneration()
    ai.onStreamText({ name: 'toc', match: systemIncludes('table of contents'), respond: { chunks: ['# A TOC'] } })
    ai.onStreamText({ name: 'chapter', match: systemIncludes('writing a chapter'), respond: { chunks: ['Chapter prose'] } })

    // Deliberately the reverse of the order the rules were registered in.
    expect(await drain(ai.streamText({ model, system: 'writing a chapter', prompt: 'x' }))).toBe('Chapter prose')
    expect(await drain(ai.streamText({ model, system: 'a table of contents', prompt: 'y' }))).toBe('# A TOC')
  })

  it('lets a later rule shadow an earlier one, which is how a journey injects a failure', async () => {
    const ai = createScriptedTextGeneration()
    ai.onStreamText({ name: 'default chapter', match: systemIncludes('chapter'), respond: { chunks: ['prose'] } })
    ai.onStreamText({ name: 'chapter 2 fails', match: promptIncludes('Chapter 2'), respond: { throws: new Error('provider is overloaded') } })

    expect(await drain(ai.streamText({ model, system: 'chapter', prompt: 'Chapter 1' }))).toBe('prose')
    await expect(drain(ai.streamText({ model, system: 'chapter', prompt: 'Chapter 2' }))).rejects.toThrow('provider is overloaded')
  })

  it('throws the exact value a failure rule names, so a typed error class survives', async () => {
    class RateLimited extends Error {
      readonly retryAfterMs = 1000
    }
    const ai = createScriptedTextGeneration()
    ai.onStreamText({ name: 'rate limited', match: () => true, respond: { throws: new RateLimited('slow down') } })

    await expect(drain(ai.streamText({ model, prompt: 'x' }))).rejects.toBeInstanceOf(RateLimited)
  })

  it('prefers a queued script over a matching rule, so a journey can force a one-off answer', async () => {
    const ai = createScriptedTextGeneration()
    ai.onStreamText({ name: 'default', match: () => true, respond: { chunks: ['from the rule'] } })
    ai.scriptStreamText(['from the queue'])

    expect(await drain(ai.streamText({ model, prompt: 'x' }))).toBe('from the queue')
    expect(await drain(ai.streamText({ model, prompt: 'x' }))).toBe('from the rule')
  })

  it('parses a rule-supplied object through the caller\'s schema, so a drifted fixture fails loudly', async () => {
    const ai = createScriptedTextGeneration()
    ai.onGenerateObject({ name: 'quiz', match: promptIncludes('quiz'), respond: { value: { questions: 'not an array' } } })

    await expect(ai.generateObject({
      model,
      schema: z.object({ questions: z.array(z.string()) }),
      prompt: 'write a quiz',
    })).rejects.toThrow()
  })

  it('matches a generateObject rule on schemaName as well as on the prompt', async () => {
    const ai = createScriptedTextGeneration()
    ai.onGenerateObject({ name: 'next book', match: schemaNamed('nextBook'), respond: { value: { title: 'Tides' } } })

    const result = await ai.generateObject({
      model,
      schema: z.object({ title: z.string() }),
      schemaName: 'nextBook',
      prompt: 'anything at all',
    })

    expect(result.title).toBe('Tides')
  })

  it('combines matchers with allOf, which is how one call site is told apart from another', async () => {
    const ai = createScriptedTextGeneration()
    // Broad rule first, narrow rule second. Rules are consulted newest first,
    // so a narrow rule must be registered AFTER the broad one it refines.
    ai.onStreamText({ name: 'any chapter', match: systemIncludes('writing a chapter'), respond: { chunks: ['first'] } })
    ai.onStreamText({
      name: 'chapter 2 only',
      match: allOf(systemIncludes('writing a chapter'), promptIncludes('This is Chapter 2 of')),
      respond: { chunks: ['second'] },
    })

    expect(await drain(ai.streamText({ model, system: 'writing a chapter', prompt: 'This is Chapter 1 of 3.' }))).toBe('first')
    expect(await drain(ai.streamText({ model, system: 'writing a chapter', prompt: 'This is Chapter 2 of 3.' }))).toBe('second')
  })

  it('throws on an unmatched call, naming the rules on offer, so no journey can reach a live provider', async () => {
    const ai = createScriptedTextGeneration()
    ai.onStreamText({ name: 'table of contents', match: systemIncludes('table of contents'), respond: { chunks: ['x'] } })

    expect(() => ai.streamText({ model, system: 'something else entirely', prompt: 'hello' }))
      .toThrow(/no rule matched a streamText call.*table of contents/s)
    await expect(ai.generateObject({ model, schema: z.object({}), prompt: 'hello' }))
      .rejects.toThrow(/no rule matched a generateObject call/)
  })

  it('records every request whether it was answered by a rule or by the queue', async () => {
    const ai = createScriptedTextGeneration()
    ai.onStreamText({ name: 'any', match: () => true, respond: { chunks: ['ok'] } })
    ai.scriptStreamText(['queued'])

    await drain(ai.streamText({ model, prompt: 'first' }))
    await drain(ai.streamText({ model, prompt: 'second' }))

    expect(ai.requests.streamText.map(req => req.prompt)).toEqual(['first', 'second'])
  })
})
