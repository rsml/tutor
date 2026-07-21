import type { FastifyInstance } from 'fastify'
import { generateObject } from 'ai'
import { z, ZodError } from 'zod'
import * as store from '../services/book-store.js'
import { createModelClient } from '../services/model-client.js'
import * as genManager from '../services/generation-manager.js'
import { FeedbackBodySchema, FinalQuizBodySchema } from '@shared/contracts.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { DEFAULT_MODEL, DEFAULT_QUIZ_LENGTH, PROFILE_EXCERPT_CHARS } from '../constants.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { createTimeout } from '../http/ai-timeout.js'
import { validateChapterNum } from '../domain/chapter-range.js'
import { sanitizeFeedback } from '../domain/sanitize.js'
import {
  DEPTH_LABELS,
  PACE_LABELS,
  METAPHOR_LABELS,
  NARRATIVE_LABELS,
  HUMOR_LABELS,
  FORMALITY_LABELS,
} from '../domain/profile-context.js'
import type { Ports } from '../composition-root.js'

export async function assessmentRoutes(fastify: FastifyInstance, _opts: { ports: Ports }) {
  fastify.get<{ Params: { id: string; num: string }; Querystring: { model?: string; provider?: string; quizLength?: string } }>(
    '/api/books/:id/chapters/:num/quiz',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const chapterNum = parseInt(request.params.num)
      const bookId = request.params.id
      await validateChapterNum(bookId, chapterNum)

      // Try loading existing quiz
      try {
        return await store.getQuiz(bookId, chapterNum)
      } catch {
        // Quiz file missing — try generating on-demand if chapter content exists
      }

      // On-demand quiz generation
      const chapterContent = await store.getChapter(bookId, chapterNum)
      const model = request.query.model || DEFAULT_MODEL
      const provider = request.query.provider || 'anthropic'
      const quizLen = request.query.quizLength ? parseInt(request.query.quizLength) : DEFAULT_QUIZ_LENGTH

      const quiz = await genManager.generateQuiz(provider, model, chapterContent, quizLen)
      await store.saveQuiz(bookId, chapterNum, quiz)
      return quiz
    },
  )

  fastify.post<{
    Params: { id: string; num: string }
    Body: unknown
  }>(
    '/api/books/:id/chapters/:num/feedback',
    { schema: { params: bookChapterSchema } },
    async (request, reply) => {
      try {
        const body = FeedbackBodySchema.parse(request.body)
        const chapterNum = parseInt(request.params.num)
        await validateChapterNum(request.params.id, chapterNum)
        const { liked, disliked, quizAnswers } = body

        // Load quiz to merge answers
        let questions: Array<{ question: string; options: string[]; correctIndex: number; userAnswer?: number; correct?: boolean }> = []
        let score = 0
        try {
          const quiz = await store.getQuiz(request.params.id, chapterNum)
          questions = quiz.questions.map((q, i) => {
            const userAnswer = quizAnswers?.[i]
            const correct = userAnswer === q.correctIndex
            if (correct) score++
            return { ...q, userAnswer, correct }
          })
        } catch {
          // No quiz exists
        }

        const feedback = {
          chapter: chapterNum,
          feedback: { liked, disliked },
          quiz: { questions, score },
        }
        await store.saveFeedback(request.params.id, chapterNum, feedback)
        return { ok: true }
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }
    },
  )

  fastify.post<{
    Params: { id: string }
    Body: unknown
  }>('/api/books/:id/final-quiz', { schema: { params: bookIdSchema } }, async (request, reply) => {
    let body: { model: string; provider?: string }
    try {
      body = FinalQuizBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { model, provider } = body
    const bookId = request.params.id

    // Return cached final quiz if it already exists
    if (store.finalQuizExists(bookId)) {
      const cached = await store.getFinalQuiz(bookId)
      return cached
    }

    const meta = await store.getBook(bookId)
    const toc = await store.getToc(bookId)

    // Scale context per chapter based on total chapter count
    const totalChapters = meta.generatedUpTo
    const charsPerChapter = totalChapters <= 2 ? 8000 : totalChapters <= 5 ? 3000 : 1500
    const chapterSummaries: string[] = []
    for (let i = 1; i <= totalChapters; i++) {
      try {
        const content = await store.getChapter(bookId, i)
        const trimmed = content.length <= charsPerChapter
          ? content
          : content.slice(0, charsPerChapter) + '...'
        chapterSummaries.push(`Chapter ${i} "${toc.chapters[i - 1]?.title}":\n${trimmed}`)
      } catch { /* skip */ }
    }

    // Gather all prior quiz data to avoid repeating questions
    const allFeedback = await store.getAllFeedback(bookId)
    const priorQuestions = allFeedback.flatMap(fb =>
      fb.quiz.questions.map(q => q.question)
    )

    // Adapt question count and focus based on chapter count
    const questionCount = totalChapters === 1 ? 5 : 10
    let focusInstructions: string
    if (totalChapters === 1) {
      focusInstructions = `Generate exactly ${questionCount} multiple-choice questions that test DEEP COMPREHENSION of the single chapter. Each question should:
- Test understanding, application, or nuance of concepts from the chapter
- Go beyond surface recall — ask about implications, relationships between ideas, or how concepts apply
- Have 4 options with exactly one correct answer`
    } else if (totalChapters <= 3) {
      focusInstructions = `Generate exactly ${questionCount} multiple-choice questions. Each question should:
- Where possible, test connections between concepts from different chapters
- Also include single-chapter comprehension questions that test deeper understanding
- Have 4 options with exactly one correct answer`
    } else {
      focusInstructions = `Generate exactly ${questionCount} multiple-choice questions that test SYNTHESIS and CROSS-CHAPTER understanding. Each question should:
- Require knowledge from 2+ chapters to answer correctly
- Test connections between concepts, not just recall
- Have 4 options with exactly one correct answer`
    }

    const timeout = createTimeout()
    try {
      const result = await generateObject({
        model: createModelClient(provider ?? DEFAULT_PROVIDER, model),
        abortSignal: timeout.signal,
        schema: z.object({
          questions: z.array(z.object({
            question: z.string(),
            options: z.array(z.string()),
            correctIndex: z.number(),
          })),
        }),
        prompt: `You are creating a final comprehensive quiz for a book the reader has just finished.

Book: ${meta.title}
Topic: ${meta.prompt}

Table of Contents:
${toc.chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Chapter content:
${chapterSummaries.join('\n\n')}

${focusInstructions}
- Be meaningfully different from these previously asked questions:
${priorQuestions.map(q => `  - ${q}`).join('\n')}

${genManager.QUIZ_QUALITY_RULES}

IMPORTANT: ONLY ask about concepts, facts, and ideas explicitly discussed in the chapter content above. Do NOT draw on outside knowledge of the topic.`,
      })

      const shuffled = genManager.shuffleQuizOptions(result.object)
      await store.saveFinalQuiz(bookId, shuffled)
      return shuffled
    } finally {
      timeout.clear()
    }
  })

  fastify.post<{
    Params: { id: string }
    Body: unknown
  }>('/api/books/:id/profile-suggestions', { schema: { params: bookIdSchema } }, async (request, reply) => {
    let body: { model: string; provider?: string }
    try {
      body = FinalQuizBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { model, provider } = body
    const bookId = request.params.id
    const meta = await store.getBook(bookId)
    const toc = await store.getToc(bookId)
    const profile = await store.getProfile()
    const allFeedback = await store.getAllFeedback(bookId)

    // Build chapter summaries (first 300 chars each)
    const chapterSummaries: string[] = []
    for (let i = 1; i <= meta.generatedUpTo; i++) {
      try {
        const content = await store.getChapter(bookId, i)
        chapterSummaries.push(`Chapter ${i} "${toc.chapters[i - 1]?.title}": ${content.slice(0, PROFILE_EXCERPT_CHARS)}...`)
      } catch { /* skip */ }
    }

    // Build per-chapter quiz performance summary
    const feedbackContext = allFeedback.map(fb => {
      const parts: string[] = []
      if (fb.feedback.liked) parts.push(`Liked: ${sanitizeFeedback(fb.feedback.liked)}`)
      if (fb.feedback.disliked) parts.push(`Disliked: ${sanitizeFeedback(fb.feedback.disliked)}`)
      if (fb.quiz.score !== undefined) {
        parts.push(`Quiz score: ${fb.quiz.score}/${fb.quiz.questions.length}`)
        const wrong = fb.quiz.questions.filter(q => q.correct === false)
        if (wrong.length > 0) {
          parts.push(`Struggled with: ${wrong.map(q => q.question).join('; ')}`)
        }
      }
      return `Chapter ${fb.chapter}: ${parts.join('. ')}`
    }).join('\n')

    // Build current profile description for context
    const currentSkills = profile.skills ?? []
    const skillsDesc = currentSkills.length > 0
      ? currentSkills.map(s => `${s.name} (${s.level}/10)`).join(', ')
      : 'None'

    const prefsDesc = [
      `Explain complex terms simply: ${profile.preferences.explainComplexTermsSimply ? 'On' : 'Off'}`,
      `Code examples: ${profile.preferences.codeExamples ? 'On' : 'Off'}`,
      `Real-world analogies: ${profile.preferences.realWorldAnalogies ? 'On' : 'Off'}`,
      `Recap previous material: ${profile.preferences.includeRecaps ? 'On' : 'Off'}`,
      `Key takeaways at end: ${profile.preferences.includeSummaries ? 'On' : 'Off'}`,
      `Visual descriptions: ${profile.preferences.visualDescriptions ? 'On' : 'Off'}`,
      `Depth: ${DEPTH_LABELS[profile.preferences.depthLevel - 1]} (${profile.preferences.depthLevel}/5)`,
      `Pace: ${PACE_LABELS[profile.preferences.pacePreference - 1]} (${profile.preferences.pacePreference}/5)`,
      `Metaphors: ${METAPHOR_LABELS[profile.preferences.metaphorDensity - 1]} (${profile.preferences.metaphorDensity}/5)`,
      `Style: ${NARRATIVE_LABELS[profile.preferences.narrativeStyle - 1]} (${profile.preferences.narrativeStyle}/5)`,
      `Humor: ${HUMOR_LABELS[profile.preferences.humorLevel - 1]} (${profile.preferences.humorLevel}/5)`,
      `Formality: ${FORMALITY_LABELS[profile.preferences.formalityLevel - 1]} (${profile.preferences.formalityLevel}/5)`,
    ].join('\n')

    const timeout = createTimeout()
    try {
      const result = await generateObject({
        model: createModelClient(provider ?? DEFAULT_PROVIDER, model),
        abortSignal: timeout.signal,
        schema: z.object({
          rationale: z.string().describe('1-3 sentence explanation of why these changes are suggested, citing evidence from quiz performance and feedback'),
          skills: z.object({
            added: z.array(z.object({ name: z.string(), level: z.number() })),
            removed: z.array(z.string()),
            updated: z.array(z.object({ name: z.string(), oldLevel: z.number(), newLevel: z.number() })),
          }),
          preferences: z.array(z.object({
            key: z.string(),
            oldValue: z.union([z.boolean(), z.number()]),
            newValue: z.union([z.boolean(), z.number()]),
          })),
          aboutMe: z.string().describe('Updated aboutMe text incorporating new knowledge areas while preserving existing identity'),
        }),
        system: `You are a learning analytics advisor. Analyze the reader's performance in this completed book and suggest updates to their learning profile.

Be conservative — only suggest changes clearly supported by evidence. Cite evidence in your rationale.

For skills: add new areas the book covered that aren't already in the profile, update levels based on quiz performance (high scores = raise level, low scores = keep or lower). Only remove a skill if evidence strongly suggests it's no longer relevant.

For preferences: only change if feedback signals a clear pattern (e.g., reader consistently says chapters are too fast → lower pace).

For aboutMe: incorporate new knowledge areas and accomplishments while preserving the existing identity and voice. If the existing aboutMe is empty, write a brief description based on what you know.

${MARKDOWN_FORMATTING_RULES}`,
        prompt: `Book just completed: "${meta.title}"
Topic: ${meta.prompt}
${meta.rating ? `Reader rating: ${meta.rating}/5` : ''}
${meta.finalQuizScore !== undefined ? `Final quiz score: ${meta.finalQuizScore}/${meta.finalQuizTotal}` : ''}

Table of Contents:
${toc.chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Chapter summaries:
${chapterSummaries.join('\n\n')}

Per-chapter feedback and quiz performance:
${feedbackContext || 'No feedback recorded.'}

Current learning profile:
- About Me: ${profile.identity || '(empty)'}
- Skills: ${skillsDesc}
- Preferences:
${prefsDesc}

Suggest profile updates based on this completed book. Return the complete updated aboutMe text (not a diff). For preferences, use these exact keys: explainComplexTermsSimply, codeExamples, realWorldAnalogies, includeRecaps, includeSummaries, visualDescriptions, depthLevel, pacePreference, metaphorDensity, narrativeStyle, humorLevel, formalityLevel. Boolean preferences use true/false, slider preferences use 1-5.`,
      })

      return result.object
    } finally {
      timeout.clear()
    }
  })
}
