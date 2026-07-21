import type { FastifyInstance } from 'fastify'
import { generateObject } from 'ai'
import { z, ZodError } from 'zod'
import * as store from '../services/book-store.js'
import { createModelClient } from '../services/model-client.js'
import { SuggestBookBodySchema, SuggestDetailsBodySchema } from '@shared/contracts.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'
import { buildProfileContext } from '../domain/profile-context.js'
import { formatSkillProgress } from '../domain/skill-progress-report.js'
import { createTimeout } from '../http/ai-timeout.js'
import type { Ports } from '../composition-root.js'

export async function suggestionRoutes(fastify: FastifyInstance, _opts: { ports: Ports }) {
  fastify.post<{ Body: unknown }>('/api/books/suggest', async (request, reply) => {
    let body: z.infer<typeof SuggestBookBodySchema>
    try {
      body = SuggestBookBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { model, provider, quizHistory, mode } = body

    const allBooks = await store.listBooks()
    const profileContext = await buildProfileContext()
    const profileUpdatedAt = await store.getProfileUpdatedAt()
    const skillProgress = await store.getSkillProgress()
    const skillProgressContext = formatSkillProgress(skillProgress)

    const bookSummaries: string[] = []
    for (const book of allBooks) {
      const parts = [`"${book.title}" — Topic: ${book.prompt.slice(0, 200)}`]
      parts.push(`Status: ${book.status}, Chapters: ${book.generatedUpTo}/${book.totalChapters}`)
      parts.push(`Started: ${book.createdAt}, Last activity: ${book.updatedAt}`)

      if (book.rating) parts.push(`Rating: ${book.rating}/5`)

      try {
        const feedback = await store.getAllFeedback(book.id)
        if (feedback.length > 0) {
          const avgScore = feedback.reduce((sum, fb) => sum + (fb.quiz.score ?? 0), 0) / feedback.length
          const totalQs = feedback.reduce((sum, fb) => sum + fb.quiz.questions.length, 0)
          parts.push(`Avg quiz score: ${avgScore.toFixed(1)}/${totalQs > 0 ? (totalQs / feedback.length).toFixed(0) : '?'}`)

          const wrongTopics = feedback.flatMap(fb =>
            fb.quiz.questions.filter(q => q.correct === false).map(q => q.question)
          )
          if (wrongTopics.length > 0) {
            parts.push(`Struggled with: ${wrongTopics.slice(0, 5).join('; ')}`)
          }
        }
      } catch { /* no feedback */ }

      const clientData = quizHistory?.[book.id]
      if (clientData) {
        const chapters = Object.entries(clientData)
        let totalCorrect = 0
        let totalQuestions = 0
        const weakAreas: string[] = []

        let latestTimestamp: string | undefined
        for (const [, ch] of chapters) {
          const latest = ch.attempts[ch.attempts.length - 1]
          if (!latest) continue
          totalCorrect += latest.score
          totalQuestions += ch.questions.length
          if (latest.timestamp && (!latestTimestamp || latest.timestamp > latestTimestamp)) {
            latestTimestamp = latest.timestamp
          }
          latest.answers.forEach((a, i) => {
            if (!a.correct) weakAreas.push(ch.questions[i].question)
          })
        }
        if (totalQuestions > 0) {
          parts.push(`Client quiz: ${totalCorrect}/${totalQuestions}${latestTimestamp ? ` (latest: ${latestTimestamp.split('T')[0]})` : ''}`)
        }
        if (weakAreas.length > 0) {
          parts.push(`Weak areas (client): ${weakAreas.slice(0, 5).join('; ')}`)
        }
      }

      try {
        const toc = await store.getToc(book.id)
        parts.push(`Chapters: ${toc.chapters.map(c => c.title).join(', ')}`)
      } catch { /* no toc */ }

      bookSummaries.push(parts.join('\n  '))
    }

    const timeout = createTimeout()
    try {
      const result = await generateObject({
        model: createModelClient(provider ?? DEFAULT_PROVIDER, model),
        abortSignal: timeout.signal,
        schemaName: 'BookSuggestion',
        schemaDescription: 'A suggested next book for the learner. Must include all three fields: topic, details, and reasoning.',
        experimental_repairText: async ({ text, error }) => {
          request.log.warn({ rawText: text, errName: error.name, errMsg: error.message }, 'generateObject (suggest) returned unparseable payload')
          return null
        },
        schema: z.object({
          topic: z.string().describe('The suggested book topic (concise, like "Kubernetes Networking" not "A book about...")'),
          details: z.string().describe('Additional context and focus areas for the book (2-3 sentences)'),
          reasoning: z.string().describe('Brief explanation of why this topic was suggested based on the learning gaps (1-2 sentences)'),
        }),
        prompt: `You are a learning advisor. Based on this reader's learning data — organized as an evidence hierarchy — suggest ONE book topic they should study next.

=== SUGGESTION MODE ===
${mode === 'deepen' ? 'DEEPEN EXISTING SKILLS: Suggest a topic that goes deeper into a skill or domain the reader already has. Look for areas where they have foundational knowledge but could level up — intermediate-to-advanced progression, filling gaps in existing expertise, or mastering a subtopic they\'ve only scratched the surface of.' : mode === 'complementary' ? 'LEARN COMPLEMENTARY SKILLS: Suggest a topic in a different domain that complements the reader\'s existing skills. Look for adjacent disciplines, cross-functional knowledge, or skills that would make their existing expertise more valuable — e.g., a developer learning design, a writer learning data visualization, a manager learning negotiation.' : 'Suggest whatever topic would be most valuable for the reader\'s growth, whether deepening existing skills or branching into new areas.'}

=== LAYER 1: LEARNER PROFILE (baseline identity + preferences) ===
${profileContext || 'No profile available.'}${profileUpdatedAt ? `\nProfile last updated: ${profileUpdatedAt.split('T')[0]}` : ''}

Note: The profile was accurate when written. Trust it proportionally to recency — a profile updated last week carries more weight than one updated a year ago. Durable facts (career role, domain expertise) remain reliable regardless of age; skill self-assessments may drift over time but were true when recorded.

=== LAYER 2: QUIZ PERFORMANCE (direct observation of knowledge) ===
${bookSummaries.length > 0 ? bookSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n\n') : 'No books or quiz data yet.'}

=== LAYER 3: SKILL MASTERY FROM BOOKS (content completion tracking) ===
${skillProgressContext || 'No skill mastery data yet.'}

=== SYNTHESIS INSTRUCTIONS ===
1. Always trust the profile as true when it was written — use the "Profile last updated" date to gauge how much the learner may have changed since then
2. When Layers 2+3 have data: use as primary evidence, but still respect the profile — it provides context (role, goals, preferences) that quiz/book data cannot
3. When Layers 2+3 are empty: the profile is the best available evidence; do NOT default to "assume no knowledge"
4. When evidence conflicts with profile: quiz/book data shows current state, profile shows prior state — the learner has changed (grown or revealed a gap); weight the more recent data accordingly
5. Look for natural progressions — partial completion of a skill suggests a complementary next topic
6. Never suggest a topic they already have a book for
7. Keep the topic specific and relevant to their role/goals (not "Programming" but "Event-Driven Architecture in Node.js")
8. The details should explain what the book should focus on and why it's a good next step given their learning data`,
      })

      return result.object
    } finally {
      timeout.clear()
    }
  })

  fastify.post<{ Body: unknown }>('/api/books/suggest-details', async (request, reply) => {
    let body: z.infer<typeof SuggestDetailsBodySchema>
    try {
      body = SuggestDetailsBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { topic, model, provider } = body
    const profileContext = await buildProfileContext()

    const timeout = createTimeout()
    try {
      const result = await generateObject({
        model: createModelClient(provider ?? DEFAULT_PROVIDER, model),
        abortSignal: timeout.signal,
        schema: z.object({
          details: z.string().describe('Specific focus areas, goals, and context for this book (2-4 sentences)'),
        }),
        prompt: `You are a learning advisor. Given a book topic and the reader's learning profile, suggest specific details for what this book should cover and how it should be tailored to the reader.

=== TOPIC ===
${topic}

=== LEARNER PROFILE ===
${profileContext || 'No profile available.'}

=== INSTRUCTIONS ===
1. Suggest specific focus areas, prerequisites to cover, and learning goals for this topic
2. Tailor the suggestions to the reader's experience level, role, and interests from their profile
3. If the profile mentions relevant skills or knowledge, reference how this book should build on them
4. Keep it practical and actionable — 2-4 sentences
5. Do NOT repeat the topic name — focus on what the book should specifically cover`,
      })

      return result.object
    } finally {
      timeout.clear()
    }
  })
}
