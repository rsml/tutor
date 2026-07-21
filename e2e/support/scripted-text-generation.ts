import type {
  GenerateObjectRequest,
  RunToolConversationRequest,
  StreamTextRequest,
  TextChunk,
} from '@server/ports/text-generation.js'
import type { FakeTextGeneration, ToolConversationStep } from '@server/ports/text-generation.fake.js'

/**
 * The TextGeneration a journey drives.
 *
 * Phase 2's `createFakeTextGeneration` answers strictly in call order, which
 * is right for a unit test that knows exactly how many model calls the code
 * under test makes. A journey does not know that. Clicking "Generate Chapter
 * 1" triggers a skill classification, a chapter stream, and a quiz, in an
 * order the UI decides and may reorder tomorrow, and a fixture list coupled
 * to that order is the single largest source of flake in a suite like this.
 *
 * So this adapter answers by intent. A rule matches on the shape of the
 * request, meaning the system prompt, the user prompt, or the schema name,
 * and returns the fixture for that call site. Rules are consulted
 * most-recently-added first, which is what makes failure injection a one
 * line addition rather than a rewrite: a journey adds a rule that matches
 * the chapter stream and throws, and it shadows the default rule underneath
 * without removing it.
 *
 * The FIFO surface from Phase 2's fake is kept, and a queued script always
 * beats a rule. Two reasons. It lets one journey force a specific one-off
 * answer without inventing a rule for it, and it lets this adapter satisfy
 * `describeTextGenerationContract`, whose subject is typed to the fake's
 * scripting and recording surface rather than to the bare port. That
 * contract run is the fidelity guarantee, see
 * `e2e/support/scripted-text-generation.contract.test.ts`.
 *
 * A call that matches neither a queued script nor a rule throws. There is no
 * default answer on purpose. Zero live-provider traffic is then structural
 * rather than a promise, because the only way to get a response out of this
 * object is to have written the response down first.
 */

/** What a matched streamText rule produces: either chunks to yield, or something to throw. */
export type StreamOutcome =
  | { chunks: string[]; chunkDelayMs?: number }
  | { throws: unknown }

/** What a matched generateObject rule produces. The value is still parsed through the caller's schema. */
export type ObjectOutcome =
  | { value: unknown }
  | { throws: unknown }

/** What a matched runToolConversation rule produces. */
export type ToolOutcome =
  | { steps: ToolConversationStep[] }
  | { throws: unknown }

export interface Rule<Req, Outcome> {
  /** Named so an unmatched-call error can list what was on offer. */
  name: string
  match: (req: Req) => boolean
  respond: Outcome | ((req: Req) => Outcome)
}

export type StreamRule = Rule<StreamTextRequest, StreamOutcome>
export type ObjectRule = Rule<GenerateObjectRequest<unknown>, ObjectOutcome>
export type ToolRule = Rule<RunToolConversationRequest, ToolOutcome>

export interface ScriptedTextGeneration extends FakeTextGeneration {
  /** Adds a streamText rule. Later rules shadow earlier ones, so this is also the failure-injection point. */
  onStreamText(rule: StreamRule): void
  /** Adds a generateObject rule. Later rules shadow earlier ones. */
  onGenerateObject(rule: ObjectRule): void
  /** Adds a runToolConversation rule. Later rules shadow earlier ones. */
  onToolConversation(rule: ToolRule): void
}

/**
 * The part of a request every matcher below reads. Deliberately one shape
 * rather than one per method, so `allOf` can combine a system matcher with a
 * prompt matcher without either being widened at the call site.
 */
export interface MatchableRequest {
  system?: string
  prompt?: string
}

/** True when the request's user prompt contains `needle`. */
export const promptIncludes = (needle: string) => (req: MatchableRequest): boolean =>
  (req.prompt ?? '').includes(needle)

/** True when the request's system prompt contains `needle`. */
export const systemIncludes = (needle: string) => (req: MatchableRequest): boolean =>
  (req.system ?? '').includes(needle)

/** True when the request carries this `schemaName`. Only one real call site sets it, so prefer prompt matching. */
export const schemaNamed = (name: string) => (req: GenerateObjectRequest<unknown>): boolean =>
  req.schemaName === name

/** True when every one of `matchers` is true. */
export const allOf = <Req>(...matchers: Array<(req: Req) => boolean>) => (req: Req): boolean =>
  matchers.every(matcher => matcher(req))

function resolve<Req, Outcome>(rule: Rule<Req, Outcome>, req: Req): Outcome {
  return typeof rule.respond === 'function'
    ? (rule.respond as (req: Req) => Outcome)(req)
    : rule.respond
}

/** The diagnostic an unmatched call raises. Names every rule that was on offer, because "no rule matched" alone is unactionable. */
function unmatched(method: string, rules: Array<{ name: string }>, detail: string): Error {
  const offered = rules.length > 0 ? rules.map(rule => rule.name).join(', ') : '(none)'
  return new Error(
    `scripted-text-generation: no rule matched a ${method} call, and nothing was queued. ` +
    `Rules on offer: ${offered}. Request: ${detail}`,
  )
}

/** A short, greppable summary of a request, for the unmatched-call diagnostic. */
function summarise(req: { system?: string; prompt?: string }): string {
  const head = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').slice(0, 120)
  return `system="${head(req.system)}" prompt="${head(req.prompt)}"`
}

export function createScriptedTextGeneration(): ScriptedTextGeneration {
  const requests: FakeTextGeneration['requests'] = {
    streamText: [],
    generateObject: [],
    runToolConversation: [],
  }

  // Rules are unshifted rather than pushed, so the newest rule is consulted
  // first and a journey can shadow a default without deleting it.
  const streamRules: StreamRule[] = []
  const objectRules: ObjectRule[] = []
  const toolRules: ToolRule[] = []

  const streamQueue: string[][] = []
  const objectQueue: unknown[] = []
  const toolQueue: ToolConversationStep[][] = []

  async function* yieldChunks(chunks: string[], signal?: AbortSignal, chunkDelayMs?: number): AsyncGenerator<string> {
    for (const chunk of chunks) {
      if (signal?.aborted) throw signal.reason
      if (chunkDelayMs) await new Promise(done => setTimeout(done, chunkDelayMs))
      yield chunk
    }
  }

  /**
   * A stream that rejects the moment it is pulled, which is how a failure
   * rule reaches the caller. Written as an iterable rather than as an async
   * generator that throws, because a generator with no `yield` is a lint
   * error and, more to the point, this shape says what it does.
   */
  function throwOnly(thrown: unknown): AsyncIterable<never> {
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(thrown) }),
    }
  }

  function streamText(req: StreamTextRequest): AsyncIterable<string> {
    requests.streamText.push(req)

    const queued = streamQueue.shift()
    if (queued) return yieldChunks(queued, req.signal)

    const rule = streamRules.find(candidate => candidate.match(req))
    if (!rule) throw unmatched('streamText', streamRules, summarise(req))

    const outcome = resolve(rule, req)
    if ('throws' in outcome) return throwOnly(outcome.throws)
    return yieldChunks(outcome.chunks, req.signal, outcome.chunkDelayMs)
  }

  async function generateObject<T>(req: GenerateObjectRequest<T>): Promise<T> {
    requests.generateObject.push(req as GenerateObjectRequest<unknown>)
    if (req.signal?.aborted) throw req.signal.reason

    if (objectQueue.length > 0) {
      return req.schema.parse(objectQueue.shift())
    }

    const wide = req as GenerateObjectRequest<unknown>
    const rule = objectRules.find(candidate => candidate.match(wide))
    if (!rule) throw unmatched('generateObject', objectRules, summarise(req))

    const outcome = resolve(rule, wide)
    if ('throws' in outcome) throw outcome.throws
    // Parsed through the caller's own schema, so a fixture that drifts away
    // from the shape the app asks for fails here, loudly, exactly as a real
    // model returning malformed output would.
    return req.schema.parse(outcome.value)
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
        throw new Error(`scripted-text-generation: scripted tool call names "${step.tool}", which is not in this request's tools.`)
      }
      await tool.execute(tool.inputSchema.parse(step.input))
    }
  }

  function runToolConversation(req: RunToolConversationRequest): AsyncIterable<TextChunk> {
    requests.runToolConversation.push(req)

    const queued = toolQueue.shift()
    if (queued) return runSteps(queued, req)

    const rule = toolRules.find(candidate => candidate.match(req))
    if (!rule) throw unmatched('runToolConversation', toolRules, summarise({ system: req.system }))

    const outcome = resolve(rule, req)
    if ('throws' in outcome) return throwOnly(outcome.throws)
    return runSteps(outcome.steps, req)
  }

  return {
    requests,
    scriptStreamText: chunks => { streamQueue.push(chunks) },
    scriptGenerateObject: value => { objectQueue.push(value) },
    scriptToolConversation: steps => { toolQueue.push(steps) },
    onStreamText: rule => { streamRules.unshift(rule) },
    onGenerateObject: rule => { objectRules.unshift(rule) },
    onToolConversation: rule => { toolRules.unshift(rule) },
    streamText,
    generateObject,
    runToolConversation,
  }
}
