export interface TocChapterForFormatting {
  title: string
  description: string
}

export interface TocForFormatting {
  title: string
  subtitle?: string
  chapters: TocChapterForFormatting[]
}

/**
 * Reconstruct the markdown representation the AI emits, so a stored TOC
 * can be re-rendered in the CreationView when a book is resumed from the
 * library. Output is the inverse of parseTocFromMarkdown's canonical input.
 */
export function formatTocAsMarkdown(toc: TocForFormatting): string {
  const lines: string[] = []
  lines.push(`# ${toc.title}`)
  if (toc.subtitle) lines.push(`*${toc.subtitle}*`)
  lines.push('')
  toc.chapters.forEach((ch, i) => {
    lines.push(`${i + 1}. **${ch.title}** — ${ch.description}`)
  })
  return lines.join('\n')
}
