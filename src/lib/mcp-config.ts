/**
 * Generate the MCP config JSON and claude CLI command for agentic book generation.
 */

export interface McpLaunchConfig {
  configJson: string
  command: string
}

export function generateMcpConfig(serverPort = 3147): McpLaunchConfig {
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
  const command = `claude --mcp-config <(echo '${JSON.stringify(config)}')`

  return { configJson, command }
}
