export interface ParsedToc {
  title: string
  subtitle?: string
  chapters: Array<{ title: string; description: string }>
}

/**
 * Parses the freeform markdown a TOC-generation or TOC-revision prompt
 * streams back into a structured title, subtitle, and chapter list. Both
 * create-book.ts and revise-toc.ts feed this the same raw AI text, so the
 * parser has to tolerate the model's actual variance in formatting rather
 * than one canonical shape.
 *
 * The chapter line regex accepts an em-dash, en-dash, hyphen, or colon as
 * the title/description separator, and requires a numbered prefix, "1." or
 * "1)", specifically so it does not also match an ordinary prose bullet
 * that merely starts with a dash. Subtitle detection only looks at the line
 * immediately after the title and before any chapter line has matched,
 * accepting either an italic line or a second-level heading.
 *
 * Falls back to "Untitled Book" whenever chapters were parsed but no `#`
 * title heading was found, rather than leaving the title empty.
 */
export function parseTocFromMarkdown(text: string): ParsedToc {
  const lines = text.split('\n').filter(l => l.trim())
  let title = ''
  let subtitle: string | undefined
  let titleFound = false
  const chapters: Array<{ title: string; description: string }> = []

  // Accept variants: leading whitespace; "1." or "1)" numbering; optional **bold**
  // or *italic* around the title; em-dash, en-dash, hyphen, or colon as separator.
  // Numbered prefix is required to avoid matching prose like "- yes — fine".
  const chapterRegex = /^\s*\d+[.)]\s+\**(.+?)\**\s*[—–\-:]\s*(.+)/

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(.+)/)
    if (titleMatch && !title) {
      title = titleMatch[1].replace(/\*\*/g, '').trim()
      titleFound = true
      continue
    }

    if (titleFound && !subtitle && chapters.length === 0) {
      const italicMatch = line.match(/^\*(.+)\*$/) || line.match(/^_(.+)_$/)
      if (italicMatch) {
        subtitle = italicMatch[1].trim()
        continue
      }
      const h2Match = line.match(/^##\s+(.+)/)
      if (h2Match) {
        subtitle = h2Match[1].trim()
        continue
      }
    }

    const chapterMatch = line.match(chapterRegex)
    if (chapterMatch) {
      chapters.push({
        title: chapterMatch[1].trim().replace(/^\**|\**$/g, '').trim(),
        description: chapterMatch[2].trim(),
      })
    }
  }

  if (!title && chapters.length > 0) {
    title = 'Untitled Book'
  }

  return { title, subtitle, chapters }
}

/**
 * Truncate or accept a parsed chapter list to match a target count.
 * If parsedCount > target: slice to target. Else: return as-is.
 */
export function truncateChapters<T>(chapters: T[], targetCount: number): T[] {
  return chapters.length > targetCount ? chapters.slice(0, targetCount) : chapters
}
