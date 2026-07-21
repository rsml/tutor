import { z } from 'zod'
import type { StartBookEvent } from '@shared/events.js'
import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import type { TextGeneration } from '../ports/text-generation.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { Clock } from '../ports/clock.js'
import { getProfileContext } from './profile-context.js'
import { createGenerateQuiz } from './generate-quiz.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import { DEFAULT_QUIZ_LENGTH } from '../constants.js'

/**
 * POST /api/books/:id/start — the first-chapter flow. Classifies the TOC's
 * skills (non-fatal on failure), streams chapter 1, saves it, generates its
 * quiz (also non-fatal), and finalizes the book to generatedUpTo 1 /
 * status reading. The caller has already checked the book is in
 * toc_review and passes its title/prompt in, matching the original inline
 * handler, which parsed topic/details from the same pre-fetched book
 * before ever calling into this flow.
 */
export interface StartBookRequest {
  model: string
  provider?: string
  quizModel?: string
  quizProvider?: string
  quizLength?: number
}

export function createStartBook(deps: { ai: TextGeneration; books: BookRepository; clock: Clock }) {
  const generateQuiz = createGenerateQuiz({ ai: deps.ai })

  return async function startBook(
    bookId: string,
    book: { title: string; prompt: string },
    req: StartBookRequest,
    send: (event: StartBookEvent) => void,
  ): Promise<void> {
    try {
      const profileContext = await getProfileContext(deps.books)
      // Pull topic/details from the stored prompt — split on the first \n\n
      // Use the user-typed topic (promptParts[0]), not the AI-generated/revised title
      const promptParts = book.prompt.split('\n\n')
      const topic = promptParts[0] ?? book.title
      const details = promptParts.length > 1 ? promptParts.slice(1).join('\n\n') : undefined

      const provider = (req.provider ?? DEFAULT_PROVIDER) as ProviderId
      const quizProvider = (req.quizProvider ?? req.provider ?? DEFAULT_PROVIDER) as ProviderId
      const quizModel = req.quizModel ?? req.model
      const quizLength = req.quizLength ?? DEFAULT_QUIZ_LENGTH

      // 1. Read book + TOC from store
      const meta = await deps.books.getBook(bookId)
      const toc = await deps.books.getToc(bookId)
      const chapters = toc.chapters

      // 2. Skill classification — write skills back to toc.yml
      let tocSkills: { name: string; weight: number }[] = []
      let chapterSkillMap: Array<{ chapterIndex: number; skills: Array<{ skill: string; subskill: string; weight: number }> }> = []
      try {
        const skillClassification = await deps.ai.generateObject({
          model: { provider, model: req.model },
          schema: z.object({
            skills: z.array(z.object({
              name: z.string(),
              weight: z.number(),
            })),
            chapters: z.array(z.object({
              chapterIndex: z.number(),
              skills: z.array(z.object({
                skill: z.string(),
                subskill: z.string(),
                weight: z.number(),
              })),
            })),
          }),
          prompt: `You are classifying the learning content of a book's table of contents like a college course curriculum.

Book title: ${meta.title}
Topic: ${topic}

Chapters:
${chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Identify 2-5 top-level skills this book teaches (broad disciplines like "Workflow Orchestration", "Distributed Systems", "API Design"). Assign each a weight 1-5 reflecting how central it is to the book.

For each chapter, identify 1-3 sub-skills that fall under the book's top-level skills. Each sub-skill must reference one of the top-level skill names. Assign weights 1-3.

Use consistent, human-readable skill names. Think of skills as what would appear on a course syllabus.`,
        })
        tocSkills = skillClassification.skills
        chapterSkillMap = skillClassification.chapters
        send({ type: 'skills_classified' })
      } catch {
        // Skill classification failure is non-fatal
      }

      // Persist skills onto the TOC (preserve existing chapters)
      const tocWithSkills = {
        skills: tocSkills.length > 0 ? tocSkills : undefined,
        chapters: chapters.map((ch, i) => ({
          ...ch,
          skills: chapterSkillMap.find(c => c.chapterIndex === i)?.skills ?? undefined,
        })),
      }
      await deps.books.saveToc(bookId, tocWithSkills)

      // 3. Update status: toc_review → generating
      meta.status = 'generating'
      meta.updatedAt = deps.clock.nowIso()
      await deps.books.saveBook(meta)

      // 4. Stream Chapter 1
      let chapterText = ''
      for await (const chunk of deps.ai.streamText({
        model: { provider, model: req.model },
        system: `You are writing a chapter for a personalized learning book. Write an engaging, clear chapter approximately 1,500 words long.

Use markdown formatting:
- Start with # heading for the chapter title
- Use ## and ### for sections
- Bold and italic for emphasis
- Bullet/numbered lists where appropriate
- Code blocks with language tags where relevant
- > blockquotes for key insights or memorable takeaways
- If you include mermaid diagrams, do NOT add style, classDef, or class directives for colors — the app applies its own theme automatically. ALWAYS wrap node labels in double quotes (e.g., \`A["My Label"]\` not \`A[My Label]\`)

Write in a conversational but knowledgeable tone. Use concrete examples and real-world analogies. Make complex ideas accessible without being condescending.
${profileContext ? `\nReader profile:\n${profileContext}\n` : ''}
${MARKDOWN_FORMATTING_RULES}`,
        prompt: `Book: ${meta.title}
Topic: ${topic}${details ? `\nContext: ${details}` : ''}

This is Chapter 1 of ${chapters.length}.
Chapter title: ${chapters[0].title}
Chapter description: ${chapters[0].description}

Write this chapter now.`,
      })) {
        chapterText += chunk
        send({ type: 'chapter', text: chunk })
      }

      await deps.books.saveChapter(bookId, 1, chapterText)

      // 5. Quiz (non-fatal)
      try {
        const quiz = await generateQuiz({
          provider: quizProvider,
          model: quizModel,
          chapterContent: chapterText,
          quizLength,
        })
        await deps.books.saveQuiz(bookId, 1, quiz)
      } catch (err) {
        console.error(`[quiz-gen] first-chapter quiz failed for ${bookId} (${quizProvider}/${quizModel}):`, err)
      }

      // 6. Finalize
      const freshMeta = await deps.books.getBook(bookId)
      freshMeta.generatedUpTo = 1
      freshMeta.status = 'reading'
      freshMeta.updatedAt = deps.clock.nowIso()
      await deps.books.saveBook(freshMeta)

      send({ type: 'done', bookId })
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }
}
