import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { BookStatusSchema } from '@shared/domain.js'

const API_URL = process.env.TUTOR_API_URL ?? 'http://127.0.0.1:3147'

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

const server = new McpServer({
  name: 'tutor',
  version: '1.0.0',
})

// --- Books ---

server.tool('list_books', 'List all books in the library', {}, async () => {
  const books = await api('GET', '/api/books')
  return { content: [{ type: 'text', text: JSON.stringify(books, null, 2) }] }
})

server.tool(
  'create_book',
  'Create a new book skeleton (directory + meta) without triggering AI generation',
  {
    title: z.string().describe('Book title'),
    prompt: z.string().describe('Book topic/prompt'),
    totalChapters: z.number().int().min(1).max(100).describe('Number of chapters'),
    subtitle: z.string().optional().describe('Book subtitle'),
  },
  async ({ title, prompt, totalChapters, subtitle }) => {
    const result = await api('POST', '/api/books/create-skeleton', { title, prompt, totalChapters, subtitle })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_book',
  'Get book metadata including status, generatedUpTo, title, etc.',
  { bookId: z.string().describe('Book ID') },
  async ({ bookId }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}`)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'update_meta',
  'Update book metadata fields (status, generatedUpTo, title, subtitle)',
  {
    bookId: z.string().describe('Book ID'),
    status: BookStatusSchema.optional().describe('New book status'),
    generatedUpTo: z.number().int().min(0).optional().describe('Last generated chapter number'),
    title: z.string().optional().describe('New title'),
    subtitle: z.string().optional().describe('New subtitle'),
  },
  async ({ bookId, ...fields }) => {
    const result = await api('PATCH', `/api/books/${encodeURIComponent(bookId)}/meta`, fields)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// --- TOC ---

server.tool(
  'save_toc',
  'Save table of contents for a book',
  {
    bookId: z.string().describe('Book ID'),
    chapters: z.array(z.object({
      title: z.string(),
      description: z.string(),
    })).describe('Array of chapter objects with title and description'),
  },
  async ({ bookId, chapters }) => {
    const result = await api('PUT', `/api/books/${encodeURIComponent(bookId)}/toc`, { chapters })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_toc',
  'Get the table of contents for a book',
  { bookId: z.string().describe('Book ID') },
  async ({ bookId }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/toc`)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// --- Chapters ---

server.tool(
  'save_chapter',
  'Save chapter markdown content',
  {
    bookId: z.string().describe('Book ID'),
    chapterNum: z.number().int().min(1).describe('Chapter number'),
    content: z.string().describe('Chapter markdown content'),
  },
  async ({ bookId, chapterNum, content }) => {
    const result = await api('PUT', `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNum}/content`, { content })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_chapter',
  'Get chapter markdown content',
  {
    bookId: z.string().describe('Book ID'),
    chapterNum: z.number().int().min(1).describe('Chapter number'),
  },
  async ({ bookId, chapterNum }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNum}`) as { content: string }
    return { content: [{ type: 'text', text: result.content }] }
  },
)

// --- Summaries ---

server.tool(
  'save_summary',
  'Save a chapter summary with key points (used for cross-chapter context)',
  {
    bookId: z.string().describe('Book ID'),
    chapterNum: z.number().int().min(1).describe('Chapter number'),
    summary: z.string().describe('~200 word chapter summary'),
    keyPoints: z.array(z.string()).describe('3-7 key points from the chapter'),
  },
  async ({ bookId, chapterNum, summary, keyPoints }) => {
    const result = await api('PUT', `/api/books/${encodeURIComponent(bookId)}/summaries/${chapterNum}`, { summary, keyPoints })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_all_summaries',
  'Get all chapter summaries for a book (for building cross-chapter context)',
  { bookId: z.string().describe('Book ID') },
  async ({ bookId }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/summaries`)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// --- Brief ---

server.tool(
  'save_brief',
  'Save the book brief/spec (markdown)',
  {
    bookId: z.string().describe('Book ID'),
    content: z.string().describe('Brief content (markdown)'),
  },
  async ({ bookId, content }) => {
    const result = await api('PUT', `/api/books/${encodeURIComponent(bookId)}/brief`, { content })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_brief',
  'Get the book brief/spec',
  { bookId: z.string().describe('Book ID') },
  async ({ bookId }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/brief`) as { content: string }
    return { content: [{ type: 'text', text: result.content }] }
  },
)

// --- References ---

server.tool(
  'save_reference',
  'Save a reference document (fetched docs, specs, etc.)',
  {
    bookId: z.string().describe('Book ID'),
    name: z.string().describe('Reference name (alphanumeric + hyphens only, e.g. "effect-docs")'),
    content: z.string().describe('Reference content (markdown)'),
  },
  async ({ bookId, name, content }) => {
    const result = await api('PUT', `/api/books/${encodeURIComponent(bookId)}/references/${encodeURIComponent(name)}`, { content })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'list_references',
  'List all saved references for a book',
  { bookId: z.string().describe('Book ID') },
  async ({ bookId }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/references`)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_reference',
  'Get a specific reference document by name',
  {
    bookId: z.string().describe('Book ID'),
    name: z.string().describe('Reference name'),
  },
  async ({ bookId, name }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/references/${encodeURIComponent(name)}`) as { content: string }
    return { content: [{ type: 'text', text: result.content }] }
  },
)

// --- Profile ---

server.tool('get_profile', 'Get the learning profile (style, preferences, skills)', {}, async () => {
  const result = await api('GET', '/api/profile')
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
})

// --- Quiz ---

server.tool(
  'save_quiz',
  'Save quiz questions for a chapter',
  {
    bookId: z.string().describe('Book ID'),
    chapterNum: z.number().int().min(1).describe('Chapter number'),
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()).length(4),
      correctIndex: z.number().int().min(0).max(3),
    })).describe('Quiz questions'),
  },
  async ({ bookId, chapterNum, questions }) => {
    const result = await api('PUT', `/api/books/${encodeURIComponent(bookId)}/quiz/${chapterNum}`, { questions })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// --- Feedback ---

server.tool(
  'get_all_feedback',
  'Get all chapter feedback for a book (reader responses + quiz results)',
  { bookId: z.string().describe('Book ID') },
  async ({ bookId }) => {
    const result = await api('GET', `/api/books/${encodeURIComponent(bookId)}/feedback`)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// Start server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`Tutor MCP server running (API: ${API_URL})`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
