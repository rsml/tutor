import { describe, it, expect } from 'vitest'
import { createFakeTextGeneration } from '../ports/text-generation.fake.js'
import { explainPassage } from './explain-passage.js'

async function drain(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('explainPassage', () => {
  it('builds a system prompt containing the surrounding chapter content and the highlighted passage', async () => {
    const textGeneration = createFakeTextGeneration()

    await drain(explainPassage({ textGeneration }, {
      model: 'claude-sonnet-4-6',
      chapterContent: 'The mitochondria is the powerhouse of the cell.',
      selectedText: 'powerhouse of the cell',
      userMessage: 'What does that mean?',
      history: [],
    }))

    const [request] = textGeneration.requests.streamText
    expect(request.system).toContain('The mitochondria is the powerhouse of the cell.')
    expect(request.system).toContain('"powerhouse of the cell"')
  })

  it('omits the highlighted-passage section and the no-repeat instruction when nothing is selected', async () => {
    const textGeneration = createFakeTextGeneration()

    await drain(explainPassage({ textGeneration }, {
      model: 'claude-sonnet-4-6',
      chapterContent: 'content',
      selectedText: '',
      userMessage: 'question',
      history: [],
    }))

    const [request] = textGeneration.requests.streamText
    expect(request.system).not.toContain('specifically highlighted')
    expect(request.system).not.toContain('Never repeat the full selected passage')
  })

  it('appends the new user message after the prior conversation history, unchanged', async () => {
    const textGeneration = createFakeTextGeneration()

    await drain(explainPassage({ textGeneration }, {
      model: 'claude-sonnet-4-6',
      chapterContent: 'content',
      selectedText: '',
      userMessage: 'Follow-up question',
      history: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
      ],
    }))

    const [request] = textGeneration.requests.streamText
    expect(request.messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow-up question' },
    ])
  })

  it('defaults to the anthropic provider when none is given, and honors an explicit one', async () => {
    const textGeneration = createFakeTextGeneration()

    await drain(explainPassage({ textGeneration }, {
      model: 'claude-sonnet-4-6', chapterContent: 'x', selectedText: '', userMessage: 'y', history: [],
    }))
    await drain(explainPassage({ textGeneration }, {
      model: 'gpt-4o', provider: 'openai', chapterContent: 'x', selectedText: '', userMessage: 'y', history: [],
    }))

    expect(textGeneration.requests.streamText[0].model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    expect(textGeneration.requests.streamText[1].model).toEqual({ provider: 'openai', model: 'gpt-4o' })
  })

  it('streams the model text chunks straight through to the caller', async () => {
    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptStreamText(['Hello', ' there'])

    const chunks = await drain(explainPassage({ textGeneration }, {
      model: 'claude-sonnet-4-6', chapterContent: 'x', selectedText: '', userMessage: 'y', history: [],
    }))

    expect(chunks).toEqual(['Hello', ' there'])
  })

  it('passes no cancellation signal, relying on the adapter for the generation timeout', async () => {
    const textGeneration = createFakeTextGeneration()

    await drain(explainPassage({ textGeneration }, {
      model: 'claude-sonnet-4-6', chapterContent: 'x', selectedText: '', userMessage: 'y', history: [],
    }))

    expect(textGeneration.requests.streamText[0].signal).toBeUndefined()
  })
})
