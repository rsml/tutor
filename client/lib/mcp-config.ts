/**
 * Generate the MCP config JSON and claude CLI command for agentic book generation.
 */

export interface McpLaunchConfig {
  configJson: string
  command: string
}

export interface BookContext {
  bookId: string
  topic: string
  details?: string
  chapterCount: number
}

export function generateMcpConfig(serverPort = 3147, book?: BookContext): McpLaunchConfig {
  const config = {
    mcpServers: {
      tutor: {
        command: 'pnpm',
        args: ['mcp:dev'],
        env: {
          TUTOR_API_URL: `http://127.0.0.1:${serverPort}`,
        },
      },
    },
  }

  const configJson = JSON.stringify(config, null, 2)
  const mcpFlag = `--mcp-config <(echo '${JSON.stringify(config)}')`

  if (book) {
    const brief = book.details
      ? `Topic: ${book.topic}\n\nDetails:\n${book.details}`
      : `Topic: ${book.topic}`
    const prompt = `Use /generate-book to generate book "${book.bookId}" (${book.chapterCount} chapters).\n\n${brief}`
    const escapedPrompt = prompt.replace(/'/g, "'\\''")
    return { configJson, command: `claude '${escapedPrompt}' ${mcpFlag}` }
  }

  return { configJson, command: `claude ${mcpFlag}` }
}
