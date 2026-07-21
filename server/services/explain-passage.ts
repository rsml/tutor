import { DEFAULT_PROVIDER, type ProviderId } from '@shared/provider.js'
import { CHAT_CONTEXT_CHARS } from '../constants.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import type { ChatMessage, TextGeneration } from '../ports/text-generation.js'

/**
 * The inline reader chat: a tutor explaining a passage the reader selected,
 * grounded in the surrounding chapter. Builds the system prompt and message
 * history, then hands off to TextGeneration.streamText(). Returns the raw
 * text-chunk stream unchanged, so the route can write each chunk straight to
 * the HTTP response without this function ever touching reply.raw.
 */

export interface ExplainPassageRequest {
  model: string
  provider?: ProviderId
  chapterContent: string
  selectedText: string
  userMessage: string
  history: ChatMessage[]
}

export interface ExplainPassageDeps {
  textGeneration: TextGeneration
}

export function explainPassage(deps: ExplainPassageDeps, req: ExplainPassageRequest): AsyncIterable<string> {
  const { chapterContent, selectedText, userMessage, history } = req

  const selectedTextSection = selectedText
    ? `\n## The user specifically highlighted this passage:\n"${selectedText}"\n`
    : ''

  const noRepeatInstruction = selectedText
    ? '\n- Never repeat the full selected passage back — the learner can see it'
    : ''

  const system = `You are a concise, knowledgeable tutor helping a learner understand a book they are reading.

## Full chapter content (for reference):
${chapterContent.slice(0, CHAT_CONTEXT_CHARS)}
${selectedTextSection}
## Instructions:
- Be concise and clear — aim for 2-4 short paragraphs max
- Use concrete examples and analogies
- If the learner asks a follow-up, build on your previous answers
- Use markdown formatting where helpful (bold, lists, code blocks)${noRepeatInstruction}
- Use the full chapter content above to inform your answers with surrounding context

${MARKDOWN_FORMATTING_RULES}`

  const messages: ChatMessage[] = [...history, { role: 'user', content: userMessage }]

  return deps.textGeneration.streamText({
    model: { provider: req.provider ?? DEFAULT_PROVIDER, model: req.model },
    system,
    messages,
  })
}
