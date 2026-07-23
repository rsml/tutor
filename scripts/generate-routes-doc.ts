/**
 * Generates `docs/api-routes.md` from the Fastify route registry, so the API
 * reference is a projection of the code rather than a hand-maintained table
 * that silently rots. `pnpm docs:routes` runs it and CI fails when the
 * committed file differs from a fresh run.
 *
 * It boots `buildServer()`, never `startServer()`. That distinction is the
 * whole safety story. `startServer` runs library migration, crash recovery
 * and interrupted-job resume, all of which write to the reader's on-disk
 * library, and none of which a docs generator has any business triggering.
 * `buildServer` registers routes and stops. As a second, independent guard
 * this script points `TUTOR_DATA_DIR` at a throwaway temp directory before
 * importing any server module, then asserts that directory is still empty,
 * so an adapter that starts writing eagerly fails the generator instead of
 * quietly touching real books.
 *
 * The route list comes from `printRoutes`, which walks Fastify's own radix
 * tree, rather than from an `onRoute` hook. A hook only fires for routes
 * registered after it is added, and by the time `buildServer` returns every
 * plugin has already booted, so a hook added here sees nothing. Re-
 * registering the plugins one at a time to catch them would mean copying
 * `buildServer`'s registration list into this file, which is exactly the
 * kind of hand-maintained duplicate the generator exists to eliminate.
 * Every path this script parses out of the tree is checked back against
 * `app.hasRoute`, so a parsing mistake fails loudly rather than publishing
 * a plausible wrong path.
 *
 * Source-file attribution is a literal search of `server/routes/*.ts` for
 * the path string, because Fastify keeps no record of which module
 * registered a route. Any path that does not resolve to exactly one module
 * throws, which is what stops the attribution column from drifting into
 * guesswork.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glob } from 'node:fs/promises'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// Set before the first server import: composition-root.ts resolves the data
// directory while constructing adapters, which happens on import.
const scratchDataDir = mkdtempSync(join(tmpdir(), 'tutor-routes-doc-'))
process.env.TUTOR_DATA_DIR = scratchDataDir

const { buildServer } = await import('../server/index.js')

interface RouteRow {
  method: string
  path: string
  sourceFile: string
}

/**
 * Turns `printRoutes` output back into absolute paths.
 *
 * The tree is a radix tree, so a node holds only the segment that its
 * parent did not already cover and a full path is the concatenation of the
 * segments down to it. Indentation is a fixed four columns per level, and
 * a node's own methods, when it has any, trail in parentheses. Nodes with
 * no methods are pure branch points and contribute a segment but no route.
 */
function parseRouteTree(tree: string): Array<{ method: string; path: string }> {
  const segments: string[] = []
  const parsed: Array<{ method: string; path: string }> = []

  for (const line of tree.split('\n')) {
    const markerIndex = Math.max(line.indexOf('├──'), line.indexOf('└──'))
    if (markerIndex < 0) continue

    const depth = markerIndex / 4
    const label = line.slice(markerIndex + 4)
    const methodMatch = /^(.*) \(([A-Z, ]+)\)$/.exec(label)
    const segment = methodMatch ? methodMatch[1] : label

    segments.length = depth
    segments[depth] = segment
    if (!methodMatch) continue

    const path = segments.join('')
    for (const method of methodMatch[2].split(', ')) {
      // Fastify pairs a HEAD route with every GET via exposeHeadRoutes. That
      // is a transport detail, not part of the surface anyone writes a
      // client against.
      if (method === 'HEAD') continue
      parsed.push({ method, path })
    }
  }

  return parsed
}

const routeSources = new Map<string, string>()
for await (const file of glob(join(repoRoot, 'server', 'routes', '*.ts'))) {
  if (basename(file).includes('.test.')) continue
  routeSources.set(`server/routes/${basename(file)}`, readFileSync(file, 'utf8'))
}
// The health route is registered on the root instance in buildServer rather
// than in a route plugin, so index.ts has to be searched as well.
routeSources.set('server/index.ts', readFileSync(join(repoRoot, 'server', 'index.ts'), 'utf8'))

/**
 * Method as well as path, because they are not enough on their own: `GET
 * /api/books` is registered in `library.ts` and `POST /api/books` in
 * `generation.ts`, so a path-only search matches both.
 */
function attribute(method: string, path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Tolerates the type parameters and the newline that a multi-line
  // registration puts between the call and its path argument.
  const registration = new RegExp(`\\.${method.toLowerCase()}\\b[^(]*\\(\\s*['"\`]${escaped}['"\`]`)
  const owners = [...routeSources.entries()]
    .filter(([, source]) => registration.test(source))
    .map(([file]) => file)
  if (owners.length === 1) return owners[0]
  throw new Error(
    `Could not attribute ${method} ${path} to a single route module (matched ${owners.length}: ${owners.join(', ') || 'none'}). ` +
      'A route registered from a computed path cannot be found by literal search. ' +
      'Give it a literal path, or teach this script how to find it.',
  )
}

// Every failure below is reported as a plain message rather than a thrown
// stack. kokoro-js pulls in an espeak WASM bundle that installs a
// process-level unhandledRejection handler which rethrows, so an
// unhandled rejection here surfaces from inside a single-line minified
// bundle and Node prints that entire line, burying the real message in a
// megabyte of WASM glue.
try {
const app = await buildServer()
await app.ready()
const rows: RouteRow[] = parseRouteTree(app.printRoutes({ commonPrefix: false })).map(({ method, path }) => {
  // Guards the tree parser: a mis-assembled path fails here rather than
  // shipping into the doc as a plausible-looking lie.
  if (!app.hasRoute({ method: method as 'GET', url: path })) {
    throw new Error(`Parsed ${method} ${path} out of printRoutes, but Fastify has no such route. The tree parser is wrong.`)
  }
  return { method, path, sourceFile: attribute(method, path) }
})
await app.close()

const leftovers = readdirSync(scratchDataDir)
rmSync(scratchDataDir, { recursive: true, force: true })
if (leftovers.length > 0) {
  throw new Error(
    `buildServer() wrote to the data directory: ${leftovers.join(', ')}. ` +
      'Generating the routes doc must not touch the library. Find the eager write and make it lazy.',
  )
}

rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))

const uniquePaths = new Set(rows.map((row) => row.path))
const byFile = new Map<string, RouteRow[]>()
for (const row of rows) {
  const group = byFile.get(row.sourceFile)
  if (group) group.push(row)
  else byFile.set(row.sourceFile, [row])
}

const sections = [...byFile.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([sourceFile, group]) => {
    const body = group.map((row) => `| \`${row.method}\` | \`${row.path}\` |`).join('\n')
    return `### \`${sourceFile}\`\n\n| Method | Path |\n|---|---|\n${body}\n`
  })

const doc = `# API Routes

<!-- Generated by \`pnpm docs:routes\` from the Fastify route registry. Do not edit by hand. -->

${rows.length} routes over ${uniquePaths.size} paths, registered by ${byFile.size} modules under [\`server/routes/\`](../server/README.md). The embedded Fastify server serves all of them on \`127.0.0.1\`, on port 3147 when run standalone with \`pnpm dev:server\` and on a free port chosen at launch under Electron.

Routes are grouped by the module that registers them. The \`HEAD\` route Fastify pairs with each \`GET\` is omitted. Request and response shapes live in [\`shared/contracts.ts\`](../shared/contracts.ts) and [\`shared/responses.ts\`](../shared/responses.ts), and the streaming routes emit the SSE unions in [\`shared/events.ts\`](../shared/events.ts).

## Why a generated table and not OpenAPI

This file is generated from the live route registry and gated in CI. The code is the single source of truth, so this table cannot describe an endpoint the server does not serve.

OpenAPI would not add anything here today.

- A spec needs JSON Schema attached to all ${rows.length} routes, and this server carries none. Validation goes through Zod in [\`server/http/parse.ts\`](../server/http/parse.ts), not Fastify's ajv \`schema.body\`, because ajv changes the 400 body the client handles and drops the Zod defaults the domain relies on.
- There is no external consumer to hand a spec to. The only client ships in this repo and imports the same Zod schemas and contract types from \`shared/\`, which is a tighter contract than generated client code.

Revisit when a second client or an outside consumer appears. The same \`buildServer\` registry walk plus \`zod-to-json-schema\` over the existing contracts can emit a real specification under this same drift gate.

${sections.join('\n')}`

await writeFile(join(repoRoot, 'docs', 'api-routes.md'), doc, 'utf8')
console.log(`Wrote docs/api-routes.md: ${rows.length} routes, ${uniquePaths.size} paths, ${byFile.size} modules`)
} catch (error) {
  rmSync(scratchDataDir, { recursive: true, force: true })
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
