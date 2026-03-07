import type { FastifyInstance } from 'fastify'
import { streamText, tool, stepCountIs } from 'ai'
import { ZodError } from 'zod'
import * as store from '../services/book-store.js'
import { createModelClient } from '../services/model-client.js'
import { UpdateProfileBodySchema, InterviewChatBodySchema, CompleteProfileSchema } from '../schemas.js'

const AI_TIMEOUT_MS = 5 * 60 * 1000

const INTERVIEW_SYSTEM_PROMPT = `You are conducting a learning profile interview to understand this reader so that an AI-generated book can be perfectly tailored to them. You combine three expert perspectives:

1. **Professional Tutor** — Understand their background, education, expertise areas, strengths/weaknesses, motivation, and learning style.
2. **World-Renowned Writer** — Understand their narrative preferences: metaphor usage, humor tolerance, formality level, storytelling vs technical prose.
3. **World-Renowned Editor** — Understand their pacing preferences, desired depth, whether they want recaps/summaries, visual descriptions, and content structure.

## Interview Rules:
- Ask ONE question at a time
- Start broad (background, what they do, what they're learning) then narrow to specifics (writing style, pace, humor)
- Follow up on interesting answers — dig deeper before moving on
- Ask at least 6-8 questions minimum before considering completion
- Before calling the tool, ask a final "Is there anything else you'd like me to know about how you learn best?"
- Keep responses concise: 2-4 sentences + your question
- When you are confident about ALL 13 preferences (7 booleans + 6 sliders), call the complete_profile tool
- The aboutMe field should be a rich 2-4 sentence synthesis of who this person is as a learner

## Preference Keys (for the tool call):
**Booleans:**
- explainComplexTermsSimply: Should complex jargon be broken down?
- assumePriorKnowledge: Can we skip basics and dive deeper?
- codeExamples: Should chapters include code snippets?
- realWorldAnalogies: Use real-world comparisons to explain concepts?
- includeRecaps: Start each chapter with a brief recap of the previous one?
- includeSummaries: End each chapter with key takeaways?
- visualDescriptions: Describe diagrams and visual mental models in text?

**Sliders (1-5):**
- depthLevel: 1=high-level overview, 5=comprehensive deep-dive
- pacePreference: 1=deliberate/slow, 5=brisk/fast-moving
- metaphorDensity: 1=rare metaphors, 5=frequent metaphors
- narrativeStyle: 1=technical/reference-style, 5=narrative/storytelling
- humorLevel: 1=serious/professional, 5=playful/witty
- formalityLevel: 1=casual/conversational, 5=academic/formal`

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.get('/api/profile', async () => {
    const profile = await store.getProfile()
    const aboutMe = [profile.identity, profile.style].filter(Boolean).join('\n\n')
    return { aboutMe, preferences: profile.preferences }
  })

  fastify.put<{ Body: unknown }>('/api/profile', async (request, reply) => {
    try {
      const body = UpdateProfileBodySchema.parse(request.body)
      await store.saveProfile({
        identity: body.aboutMe,
        style: '',
        preferences: body.preferences,
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }
  })

  fastify.post<{ Body: unknown }>('/api/profile/interview', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    let body: { model: string; provider?: string; userMessage: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }
    try {
      body = InterviewChatBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { model, provider, userMessage, history } = body
    const modelClient = createModelClient(provider ?? 'anthropic', model)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const sendLine = (data: Record<string, unknown>) => {
      reply.raw.write(JSON.stringify(data) + '\n')
    }

    try {
      const result = streamText({
        model: modelClient,
        system: INTERVIEW_SYSTEM_PROMPT,
        messages: [
          ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: userMessage },
        ],
        tools: {
          complete_profile: tool({
            description: 'Call this when you have gathered enough information to build the complete learning profile. Only call after asking at least 6-8 questions and a final confirmation.',
            inputSchema: CompleteProfileSchema,
            execute: async (profileData) => {
              await store.saveProfile({
                identity: profileData.aboutMe,
                style: '',
                preferences: profileData.preferences,
              })
              sendLine({ type: 'profile_complete', profile: profileData })
              return 'Profile saved successfully.'
            },
          }),
        },
        stopWhen: stepCountIs(2),
        abortSignal: controller.signal,
      })

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          sendLine({ type: 'text', content: part.text })
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        sendLine({ type: 'error', message: (err as Error).message || 'Interview failed' })
      }
    } finally {
      clearTimeout(timer)
      reply.raw.end()
    }
  })
}
