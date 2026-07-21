Up: [ARCHITECTURE.md](../ARCHITECTURE.md)

# server/

Tutor's backend is a single Fastify instance. Embedded in Electron, it binds a free port chosen at launch. Standalone, via `pnpm dev:server`, it binds `127.0.0.1:3147`.

Routes parse and delegate, services decide, and adapters do the I/O behind the ports that name it. Dependency points inward. Routes depend on services, services depend on ports by shape, and nothing in a service or a port imports a route or a concrete adapter. See [ports/README.md](ports/README.md), [adapters/README.md](adapters/README.md), and [services/README.md](services/README.md) for each layer. `domain/` holds pure functions with no I/O of their own. `http/` holds the Fastify glue, the error handler, body parsing, route params, and status codes.

`prompts/` holds shared prompt fragments as TypeScript, today the markdown formatting rules appended to generation prompts. The prompts themselves live inline in the services that call `TextGeneration`.

To add an endpoint, follow the `add-feature` Agent Skill at [.claude/skills/add-feature/SKILL.md](../.claude/skills/add-feature/SKILL.md). It ends with `pnpm docs:routes`, which regenerates [docs/api-routes.md](../docs/api-routes.md). Commit the result.

`buildServer` wires ports, registers routes, and stops there, so tests and tooling can drive a fully registered server with `fastify.inject` without binding a port or mutating the on-disk library. `startServer` additionally runs `runStartupTasks`, library migration, then crash recovery, then interrupted-job resume, in that order, and listens.

The packaged Electron app binds a free port chosen at launch, so pointing the MCP server at a running app requires starting one with `pnpm dev:server` on 3147 instead.

## Where to look

| Path | Holds |
|------|-------|
| `routes/` | thin HTTP, parse input, call a port or service, return the result |
| `services/` | application logic, orchestrates ports |
| `ports/` | interfaces, one per external dependency |
| `adapters/` | the real I/O behind each port |
| `domain/` | pure rules, no I/O |
| `http/` | Fastify glue, error handler, body parsing, route params, status codes |
| `migrations/` | forward-only schema steps |
| `prompts/` | shared prompt fragments as TypeScript |
| `test/` | shared test harness |
| `composition-root.ts` | the one place adapters are chosen |
| `mcp-server.ts` | the MCP entry point |

Related: [ports/README.md](ports/README.md), [adapters/README.md](adapters/README.md), [services/README.md](services/README.md), [migrations/README.md](migrations/README.md), [ADR 0001](../docs/adr/0001-filesystem-as-the-database.md), [ADR 0002](../docs/adr/0002-just-in-time-chapter-generation.md), [ADR 0005](../docs/adr/0005-ai-sdk-behind-a-port.md)
