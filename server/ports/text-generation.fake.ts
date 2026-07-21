import type {
  GenerateObjectRequest,
  RunToolConversationRequest,
  StreamTextRequest,
  TextChunk,
  TextGeneration,
} from './text-generation.js'

/**
 * In-memory TextGeneration. Every method records the request it received
 * and returns a scripted response instead of calling any model, so it never
 * touches a network and never costs money.
 *
 * Responses are queued per method (`scriptStreamText`, `scriptGenerateObject`,
 * `scriptToolConversation`): each call consumes the oldest still-queued
 * response, and once the queue is empty falls back to a fixed, deterministic
 * default. `generateObject` has no such default, because there is no
 * type-safe placeholder value for an arbitrary caller-supplied schema — an
 * unscripted call fails loudly instead of silently returning a value that
 * might not satisfy the caller's schema.
 */

export type ToolConversationStep =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; tool: string; input: unknown }

export interface FakeTextGeneration extends TextGeneration {
  /** Every request handed to each method, in call order, so a test can assert what a caller actually sent (e.g. that a prompt contained the profile context). */
  requests: {
    streamText: StreamTextRequest[]
    generateObject: GenerateObjectRequest<unknown>[]
    runToolConversation: RunToolConversationRequest[]
  }
  /** Queues the chunks the next streamText() call yields, in order. */
  scriptStreamText(chunks: string[]): void
  /** Queues the value the next generateObject() call resolves with, parsed through the caller's schema (so an invalid value rejects, exactly as a real model returning malformed output would). */
  scriptGenerateObject(value: unknown): void
  /** Queues the steps the next runToolConversation() call works through, in order. A 'tool-call' step invokes that tool's execute() as a side effect and yields nothing; a 'text' step yields one TextChunk. */
  scriptToolConversation(steps: ToolConversationStep[]): void
  /**
   * Optional. A sibling branch declares its own FakeTextGeneration
   * implementation as a full object literal, predating failure scripting,
   * so a required member here would break that branch's typecheck at
   * merge. createFakeTextGeneration implements both this and
   * scriptStreamFailure for real. Queues a rejection consumed by the next
   * generateObject() call.
   */
  scriptFailure?(error: unknown): void
  /**
   * Optional for the same reason as scriptFailure. Queues a stream that
   * yields opts.afterChunks, defaulting to no chunks, and then throws
   * error, so a caller can pin exactly how many chunks reach the client
   * before a stream fails.
   */
  scriptStreamFailure?(error: unknown, opts?: { afterChunks?: string[] }): void
}

const DEFAULT_STREAM_CHUNKS = ['[fake streamed text]']
const DEFAULT_TOOL_CONVERSATION_STEPS: ToolConversationStep[] = [{ type: 'text', text: '[fake tool conversation response]' }]

export function createFakeTextGeneration(): FakeTextGeneration {
  const requests: FakeTextGeneration['requests'] = {
    streamText: [],
    generateObject: [],
    runToolConversation: [],
  }

  const streamQueue: string[][] = []
  const objectQueue: unknown[] = []
  const toolConversationQueue: ToolConversationStep[][] = []
  const failureQueue: unknown[] = []
  const streamFailureQueue: Array<{ error: unknown; afterChunks: string[] }> = []

  function scriptStreamText(chunks: string[]): void {
    streamQueue.push(chunks)
  }

  function scriptGenerateObject(value: unknown): void {
    objectQueue.push(value)
  }

  function scriptToolConversation(steps: ToolConversationStep[]): void {
    toolConversationQueue.push(steps)
  }

  function scriptFailure(error: unknown): void {
    failureQueue.push(error)
  }

  function scriptStreamFailure(error: unknown, opts?: { afterChunks?: string[] }): void {
    streamFailureQueue.push({ error, afterChunks: opts?.afterChunks ?? [] })
  }

  async function* yieldChunks(chunks: string[], signal?: AbortSignal): AsyncGenerator<string> {
    for (const chunk of chunks) {
      if (signal?.aborted) throw signal.reason
      yield chunk
    }
  }

  /** Like yieldChunks, but throws error once every chunk has been yielded, so a caller can pin how many chunks reach the client before a stream fails. */
  async function* yieldChunksThenFail(chunks: string[], error: unknown, signal?: AbortSignal): AsyncGenerator<string> {
    for (const chunk of chunks) {
      if (signal?.aborted) throw signal.reason
      yield chunk
    }
    throw error
  }

  function streamText(req: StreamTextRequest): AsyncIterable<string> {
    requests.streamText.push(req)
    const scriptedFailure = streamFailureQueue.shift()
    if (scriptedFailure) {
      return yieldChunksThenFail(scriptedFailure.afterChunks, scriptedFailure.error, req.signal)
    }
    const chunks = streamQueue.shift() ?? DEFAULT_STREAM_CHUNKS
    return yieldChunks(chunks, req.signal)
  }

  async function generateObject<T>(req: GenerateObjectRequest<T>): Promise<T> {
    requests.generateObject.push(req as GenerateObjectRequest<unknown>)
    if (req.signal?.aborted) throw req.signal.reason
    if (failureQueue.length > 0) {
      throw failureQueue.shift()
    }
    if (objectQueue.length === 0) {
      throw new Error(
        'createFakeTextGeneration: no scripted generateObject response queued. Call scriptGenerateObject(value) before the code under test invokes generateObject().',
      )
    }
    const value = objectQueue.shift()
    return req.schema.parse(value)
  }

  async function* runSteps(steps: ToolConversationStep[], req: RunToolConversationRequest): AsyncGenerator<TextChunk> {
    for (const step of steps.slice(0, req.maxSteps)) {
      if (req.signal?.aborted) throw req.signal.reason
      if (step.type === 'text') {
        yield { type: 'text', text: step.text }
        continue
      }
      const tool = req.tools[step.tool]
      if (!tool) {
        throw new Error(`createFakeTextGeneration: scripted tool call names "${step.tool}", which is not in this request's tools.`)
      }
      const input = tool.inputSchema.parse(step.input)
      await tool.execute(input)
    }
  }

  function runToolConversation(req: RunToolConversationRequest): AsyncIterable<TextChunk> {
    requests.runToolConversation.push(req)
    const steps = toolConversationQueue.shift() ?? DEFAULT_TOOL_CONVERSATION_STEPS
    return runSteps(steps, req)
  }

  return {
    requests,
    scriptStreamText,
    scriptGenerateObject,
    scriptToolConversation,
    scriptFailure,
    scriptStreamFailure,
    streamText,
    generateObject,
    runToolConversation,
  }
}
