#!/usr/bin/env tsx
/**
 * Walks every committed .md file and verifies that every markdown link
 * target and every backticked repo-path-looking string actually exists on
 * disk. Exits non-zero and lists every miss otherwise.
 *
 * Scope: docs/plans/refactor/** is excluded. Those are archived planning
 * documents narrating a refactor that already happened, so they are full of
 * paths that were true historically and are deliberately not true today (an
 * old `@src/` alias renamed to `@client/`, a `@marp-team/marp-cli` devDependency
 * removed, an old `server/schemas.ts` split apart). Hand-maintaining a list
 * of which of hundreds of historical mentions are "intentionally stale"
 * would cost more than just not scanning a folder whose entire purpose is
 * to be a historical record. server/migrations/__fixtures__/**.md is
 * excluded too — those are fake book chapters used as migration test
 * fixtures, not documentation.
 *
 * Markdown links (`[text](target)`) and backticked spans are checked with
 * different strictness. A markdown link is a deliberate, unambiguous
 * pointer, so every non-URL, non-anchor-only target is checked directly. A
 * backtick span is ordinary inline-code formatting used for far more than
 * paths (identifiers, shell commands, npm scoped package names like
 * `@reduxjs/toolkit`, or prose describing a naming *pattern* like
 * `chapters/NN.md` rather than a real file), so a backtick candidate only
 * counts as a path if it contains a `/` AND (it is a relative `./`/`../`
 * link, an `@client`/`@server`/`@shared` alias, or its first segment
 * matches a real top-level entry of this repo). The top-level entry set is
 * computed from `git ls-files`, never hardcoded, so it can't drift from the
 * real tree.
 *
 * Usage: pnpm tsx scripts/check-doc-paths.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** tsconfig.json's path aliases, so `@shared/domain.js` resolves the same way tsc resolves it. */
const ALIASES: Record<string, string> = {
  '@client/': 'client/',
  '@server/': 'server/',
  '@shared/': 'shared/',
}

/** Doc trees deliberately not scanned. See the header comment for why. */
const EXCLUDED_DOC_PREFIXES = [
  'docs/plans/refactor/',
  'server/migrations/__fixtures__/',
]

interface Miss {
  doc: string
  raw: string
}

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf-8' })
}

function trackedMarkdownFiles(): string[] {
  return git('ls-files "*.md"')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !EXCLUDED_DOC_PREFIXES.some(prefix => line.startsWith(prefix)))
}

/** Every real top-level file/directory name in the repo, so a bare candidate like `chapters/NN.md` (no such top-level dir) can be told apart from a real one like `server/index.ts`. */
function topLevelEntries(): Set<string> {
  const entries = new Set<string>()
  for (const line of git('ls-files').split('\n')) {
    const first = line.split('/')[0]
    if (first) entries.add(first)
  }
  return entries
}

function isUrl(candidate: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(candidate)
}

/** Strips a trailing `#fragment`. Returns '' for a candidate that was only an anchor. */
function stripAnchor(candidate: string): string {
  const hashIndex = candidate.indexOf('#')
  return hashIndex === -1 ? candidate : candidate.slice(0, hashIndex)
}

function isAliasOrRelative(candidate: string): boolean {
  return candidate.startsWith('./') || candidate.startsWith('../')
    || Object.keys(ALIASES).some(alias => candidate.startsWith(alias))
}

/**
 * Resolves a candidate string to an absolute filesystem path, or null if it
 * was anchor-only. `defaultToDocRelative` governs what a plain candidate
 * with no `./`, `../`, or `@alias/` prefix means: a markdown link target is
 * relative to the *linking* doc's own directory per CommonMark, with or
 * without an explicit `./` (e.g. `server/README.md` linking to bare
 * `ports/README.md` means `server/ports/README.md`), whereas this repo's
 * docs write backticked code-span paths repo-root-relative regardless of
 * which file mentions them (e.g. `` `shared/domain.ts` `` always means the
 * same file, however deep the mentioning doc is nested).
 */
function resolveCandidate(rawCandidate: string, docPath: string, defaultToDocRelative: boolean): string | null {
  const candidate = stripAnchor(rawCandidate.trim())
  if (candidate.length === 0) return null

  if (candidate.startsWith('./') || candidate.startsWith('../')) {
    return resolve(REPO_ROOT, dirname(docPath), candidate)
  }
  for (const [alias, real] of Object.entries(ALIASES)) {
    if (candidate.startsWith(alias)) {
      return join(REPO_ROOT, real, candidate.slice(alias.length))
    }
  }
  return defaultToDocRelative
    ? resolve(REPO_ROOT, dirname(docPath), candidate)
    : join(REPO_ROOT, candidate)
}

/** TypeScript ESM specifiers write `.js` for a source file that is actually `.ts`/`.tsx` on disk. */
function pathExists(absPath: string): boolean {
  if (existsSync(absPath)) return true
  if (absPath.endsWith('.js')) {
    const withoutExt = absPath.slice(0, -'.js'.length)
    if (existsSync(withoutExt + '.ts') || existsSync(withoutExt + '.tsx')) return true
  }
  return false
}

function shouldSkip(candidate: string): boolean {
  if (candidate.length === 0) return true
  if (isUrl(candidate)) return true
  if (candidate.startsWith('#')) return true
  if (candidate.includes('{') || candidate.includes('*')) return true // brace-glob / wildcard pattern
  if (candidate.includes('<') || candidate.includes('>')) return true // <placeholder> template token
  if (/\s/.test(candidate)) return true // not a bare path reference
  return false
}

function extractLinkTargets(content: string): string[] {
  const targets: string[] = []
  const re = /\[[^\]]*\]\(([^)]+)\)/g
  for (const match of content.matchAll(re)) targets.push(match[1])
  return targets
}

function extractBacktickCandidates(content: string): string[] {
  const candidates: string[] = []
  const re = /`([^`]+)`/g
  for (const match of content.matchAll(re)) {
    if (match[1].includes('/')) candidates.push(match[1])
  }
  return candidates
}

function main(): void {
  const docs = trackedMarkdownFiles()
  const topLevel = topLevelEntries()
  const misses: Miss[] = []
  const seenMisses = new Set<string>()
  let checked = 0
  let docsWithChecks = 0

  for (const doc of docs) {
    const content = readFileSync(join(REPO_ROOT, doc), 'utf-8')
    let checkedInDoc = 0

    const linkCandidates = extractLinkTargets(content)
      .filter(raw => !shouldSkip(raw))
      .map(raw => ({ raw, docRelative: true }))
    const backtickCandidates = extractBacktickCandidates(content)
      .filter(raw => !shouldSkip(raw))
      .filter(raw => isAliasOrRelative(raw) || topLevel.has(raw.split('/')[0]))
      .map(raw => ({ raw, docRelative: false }))

    for (const { raw, docRelative } of [...linkCandidates, ...backtickCandidates]) {
      const absPath = resolveCandidate(raw, doc, docRelative)
      if (!absPath) continue
      checked++
      checkedInDoc++
      if (!pathExists(absPath)) {
        const key = `${doc}::${raw}`
        if (!seenMisses.has(key)) {
          seenMisses.add(key)
          misses.push({ doc, raw })
        }
      }
    }

    if (checkedInDoc > 0) docsWithChecks++
  }

  console.log(`Checked ${checked} path reference(s) across ${docsWithChecks} doc(s) (${docs.length} scanned).`)

  if (misses.length > 0) {
    console.log('')
    console.log(`${misses.length} broken path reference(s):`)
    for (const miss of misses) {
      console.log(`  ${miss.doc}: ${miss.raw}`)
    }
    process.exit(1)
  }

  console.log('All referenced paths exist.')
}

main()
