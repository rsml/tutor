#!/usr/bin/env tsx
/**
 * Quiz-generation bifurcation harness.
 *
 * Walks the failure-mode decision tree from cheapest/most-foundational to
 * most-integrated, and reports the FIRST layer that breaks. Each step is
 * self-contained and prints the implicated hypotheses on failure.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... pnpm tsx scripts/diagnose-quiz.ts
 *   OPENAI_API_KEY=sk-... pnpm tsx scripts/diagnose-quiz.ts --provider openai --model gpt-4o
 *   pnpm tsx scripts/diagnose-quiz.ts --provider anthropic --model claude-haiku-4-5-20251001
 *
 * Decision tree
 *   Step 1: provider auth                 — basic generateText('ping')
 *   Step 2: structured output (trivial)   — generateObject with {answer: z.string()}
 *   Step 3: strict-length schema          — generateObject with .length(3) array
 *   Step 4: full quiz schema, tiny input  — production schema, 200-word fixture
 *   Step 5: full quiz schema, real chapter — production schema, 1500-word fixture
 *   Step 6: production generateQuiz()     — actual function used in app
 */
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateQuiz, QUIZ_QUALITY_RULES } from '../server/services/generation-manager.js'
import { MARKDOWN_FORMATTING_RULES } from '../server/prompts/formatting-rules.js'

interface Args { provider: 'anthropic' | 'openai' | 'google'; model: string }

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let provider: Args['provider'] = 'anthropic'
  let model = 'claude-sonnet-4-6'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider') provider = argv[++i] as Args['provider']
    else if (argv[i] === '--model') model = argv[++i]
  }
  if (provider === 'openai' && model === 'claude-sonnet-4-6') model = 'gpt-4o'
  if (provider === 'google' && model === 'claude-sonnet-4-6') model = 'gemini-2.0-flash'
  return { provider, model }
}

function getApiKey(provider: Args['provider']): string {
  const envName = provider === 'google'
    ? (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY)
    : provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY
  if (!envName) {
    throw new Error(`Set ${provider.toUpperCase()}_API_KEY in env`)
  }
  return envName
}

function modelFor(provider: Args['provider'], model: string, apiKey: string) {
  switch (provider) {
    case 'openai': return createOpenAI({ apiKey })(model)
    case 'google': return createGoogleGenerativeAI({ apiKey })(model)
    default:       return createAnthropic({ apiKey })(model)
  }
}

const TINY_CHAPTER = `# A Tiny Chapter

This chapter introduces the concept of CAP theorem. CAP stands for Consistency,
Availability, and Partition tolerance. The theorem states that a distributed
system can guarantee at most two of these three properties at any given time.

When a network partition occurs, a system must choose between staying available
(continuing to serve requests with possibly stale data) or staying consistent
(refusing requests until the partition heals). Most modern databases choose
availability and accept eventual consistency.`

const REAL_CHAPTER = `# Understanding Backpressure in Streaming Systems

When data flows through a pipeline faster than downstream consumers can handle,
the producer must slow down — otherwise queues unbounded-grow and the whole
system eventually crashes from memory exhaustion. The mechanism that lets the
slow consumer signal the fast producer to ease off is called backpressure.

## Why naive solutions fail

The simplest "solution" is to drop messages when the downstream queue fills.
This works fine for telemetry (one lost packet hurts no one) but is catastrophic
for systems that need exactly-once delivery — order placement, banking,
inventory updates. Dropping is acceptable only when the contract explicitly
allows it.

A second naive approach: buffer everything. Add a larger queue, then a larger
queue, then disk-backed queues. Each layer just defers the inevitable — the
fundamental imbalance (producer rate > consumer rate) doesn't go away. The
queue grows until storage fills.

The third trap: throttling the producer based on a fixed rate. This requires
guessing the consumer's capacity ahead of time. Real systems have variable
capacity (GC pauses, cold caches, downstream timeouts) so any fixed throttle is
either too aggressive (wasted throughput) or too lenient (still overruns).

## What backpressure actually does

Backpressure flips the control direction. Instead of the producer pushing
"please consume this", the consumer pulls "I am ready for one more message".
Each unit moves only when the next stage has explicit capacity. The producer
naturally idles when no demand exists.

Reactive Streams formalizes this with a \`request(n)\` call: subscribers tell
publishers how many items they can handle. Project Reactor, RxJava, and Akka
Streams all implement this contract. TCP flow control works on the same
principle at a lower layer — the receiver's advertised window tells the sender
how many bytes it can buffer.

## Implementing it yourself

If you're building a custom pipeline without these libraries, the simplest
practical pattern is the bounded blocking queue. Producer offers; if the queue
is full, the offer blocks until a consumer takes. Java's
\`ArrayBlockingQueue(capacity)\` does exactly this. Go channels with finite
capacity behave the same way. Node.js streams use \`push()\` returning false to
signal "stop until \`drain\` fires".

## When backpressure is the wrong answer

Backpressure assumes the producer can wait. For real-time streams where late
data is useless (live video, sensor telemetry, market quotes), the right answer
is sampling or dropping — keep the latest, discard the rest. A 100ms-stale
stock quote is worse than no quote.

## Summary

Backpressure is consumer-driven flow control. It prevents unbounded queues by
making demand explicit. Use it whenever the producer can wait; sample or drop
when it can't.`

const QuizSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    correctIndex: z.number().int().min(0).max(3),
  })).length(3),
})

interface StepResult { ok: boolean; error?: unknown; durationMs: number }

async function step(label: string, fn: () => Promise<unknown>): Promise<StepResult> {
  const started = Date.now()
  process.stdout.write(`  ${label} ... `)
  try {
    await fn()
    const durationMs = Date.now() - started
    process.stdout.write(`OK (${durationMs}ms)\n`)
    return { ok: true, durationMs }
  } catch (error) {
    const durationMs = Date.now() - started
    process.stdout.write(`FAIL (${durationMs}ms)\n`)
    return { ok: false, error, durationMs }
  }
}

function reportFailure(stepNum: number, hypotheses: string, error: unknown): void {
  console.log('')
  console.log('─'.repeat(72))
  console.log(`VERDICT — first failure at step ${stepNum}`)
  console.log('─'.repeat(72))
  console.log('Implicated hypotheses:', hypotheses)
  console.log('')
  console.log('Error:')
  console.log(error instanceof Error ? (error.stack ?? error.message) : String(error))
  console.log('')
}

async function main() {
  const { provider, model } = parseArgs()
  const apiKey = getApiKey(provider)
  const llm = modelFor(provider, model, apiKey)

  console.log(`Provider: ${provider}   Model: ${model}`)
  console.log('')

  // Step 1: provider auth — does the key work at all?
  {
    const r = await step('Step 1: provider auth (generateText "ping")', async () => {
      await generateText({ model: llm, prompt: 'Say "pong" and nothing else.' })
    })
    if (!r.ok) {
      reportFailure(1, 'h1 (override→provider missing key), h2 (model not on tier), h3 (key path), h19 (rate limit), h20 (SDK version)', r.error)
      process.exit(1)
    }
  }

  // Step 2: structured output basic check
  {
    const r = await step('Step 2: generateObject with trivial schema', async () => {
      await generateObject({
        model: llm,
        schema: z.object({ answer: z.string() }),
        prompt: 'Reply with the word "hi" in the answer field.',
      })
    })
    if (!r.ok) {
      reportFailure(2, 'h9 (mode=json vs tool), h10 (SDK tool-call shape mismatch)', r.error)
      process.exit(1)
    }
  }

  // Step 3: strict-length array schema
  {
    const r = await step('Step 3: generateObject with .length(3) constraint', async () => {
      await generateObject({
        model: llm,
        schema: z.object({ items: z.array(z.string()).length(3) }),
        prompt: 'Return exactly three short greetings.',
      })
    })
    if (!r.ok) {
      reportFailure(3, 'h5 (.length() strict), h6 (.length(4) options)', r.error)
      process.exit(1)
    }
  }

  // Step 4: full quiz schema with TINY chapter content
  {
    const r = await step('Step 4: full quiz schema, tiny chapter (~100 words)', async () => {
      await generateObject({
        model: llm,
        schema: QuizSchema,
        prompt: `Based on this chapter content, generate exactly 3 multiple-choice quiz questions to test comprehension. Each question should have 4 options with exactly one correct answer.\n\n${QUIZ_QUALITY_RULES}\n\nChapter content:\n${TINY_CHAPTER}`,
      })
    })
    if (!r.ok) {
      reportFailure(4, 'h7 (correctIndex type coercion), h8 (no field descriptions), h13 (refusal in tool mode)', r.error)
      process.exit(1)
    }
  }

  // Step 5: full quiz schema with REAL chapter + MARKDOWN_FORMATTING_RULES (mirrors production prompt exactly)
  {
    const r = await step('Step 5: full quiz schema, real chapter + formatting rules', async () => {
      await generateObject({
        model: llm,
        schema: QuizSchema,
        prompt: `Based on this chapter content, generate exactly 3 multiple-choice quiz questions to test comprehension. Each question should have 4 options with exactly one correct answer.\n\n${QUIZ_QUALITY_RULES}\n\n${MARKDOWN_FORMATTING_RULES}\n\nChapter content:\n${REAL_CHAPTER}`,
      })
    })
    if (!r.ok) {
      reportFailure(5, 'h11 (MARKDOWN_FORMATTING_RULES poisoning), h12 (context size), h13 (refusal)', r.error)
      process.exit(1)
    }
  }

  // Step 6: production generateQuiz()
  {
    // generateQuiz uses createModelClient → key-store. Make sure the key is in
    // the env so key-store picks it up (it reads env on module load — already
    // happened by this point, but env vars set before this script runs are
    // fine).
    if (!process.env[`${provider.toUpperCase()}_API_KEY`]) {
      console.log('  Step 6: SKIP (set provider API key env var to test the production path)')
    } else {
      const r = await step('Step 6: production generateQuiz()', async () => {
        const quiz = await generateQuiz(provider, model, REAL_CHAPTER, 3)
        if (quiz.questions.length !== 3) {
          throw new Error(`Expected 3 questions, got ${quiz.questions.length}`)
        }
      })
      if (!r.ok) {
        reportFailure(6, 'h14 (AbortSignal leak), h15 (auto-retry timeout), h18 (shuffle indexing)', r.error)
        process.exit(1)
      }
    }
  }

  console.log('')
  console.log('─'.repeat(72))
  console.log('VERDICT — all layers pass for this provider/model.')
  console.log('─'.repeat(72))
  console.log('If quizzes are still missing in the app, the bug is in the route or')
  console.log('frontend flow (hypotheses 16, 17):')
  console.log('  • h16: first-chapter path in books.ts:357 fails silently')
  console.log('  • h17: on-demand quiz route at books.ts:520 returns 500 → client')
  console.log('         falls through to feedback with no error toast')
  console.log('')
  console.log('Next: add console.error to the two catch {} blocks in')
  console.log('generation-manager.ts:338 and books.ts:360, regenerate one chapter,')
  console.log('and read server stderr.')
}

main().catch((err) => {
  console.error('Harness crashed:', err)
  process.exit(2)
})
