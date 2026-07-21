// Transforms markdown into plain text optimized for TTS narration (Kokoro).
// Pure function: no I/O, no external markdown parser. Uses regex/string ops.
// Kokoro respects \n\n as a roughly 600ms pause, so paragraph structure is preserved.

/**
 * Structural markup, headings, lists, tables, blockquotes, is rewritten
 * into plain sentences rather than dropped, so content that was only
 * conveyed visually still reaches the listener. List items and headings
 * each get a trailing period when they lack one, so Kokoro's sentence
 * splitter treats every item as its own sentence instead of one run-on
 * line that can overflow its tokenizer.
 */
export function stripMarkdownForNarration(md: string): string {
  if (!md) return ''

  let text = md.replace(/\r\n/g, '\n')

  // 1. Remove fenced code blocks entirely (including any markdown-looking content inside).
  //    Match ``` or ~~~ fences with optional language tag.
  text = text.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?\n[ \t]*\1[ \t]*$/gm, '')

  // 2. Remove images: ![alt](url) — alt text is visual-only.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')

  // 3. Links [text](url) -> text (run before inline-code stripping to avoid grabbing `]`).
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')

  // 4. Footnote markers [^1] -> remove.
  text = text.replace(/\[\^[^\]]+\]/g, '')

  // 5. Tables: convert each data row to "Header: Cell, Header: Cell." sentences.
  text = transformTables(text)

  // 6. Headings: "# Title" -> "Title." (skip duplicate punctuation).
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, (_, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return ''
    return /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.'
  })

  // 7. Blockquotes: drop leading "> " markers, keep text.
  text = text.replace(/^[ \t]{0,3}>[ \t]?/gm, '')

  // 8. List markers: drop "-", "*", "+", or "1." prefix. Preserve item text.
  //    Also append "." if the item doesn't already end in sentence punctuation,
  //    so Kokoro's sentence splitter doesn't lump multiple bullets into one
  //    massive "sentence" that overflows the tokenizer's 510-token limit.
  text = text.replace(/^[ \t]*([-*+]|\d+\.)[ \t]+(.*)$/gm, (_, _marker: string, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return ''
    return /[.!?:;]$/.test(trimmed) ? trimmed : trimmed + '.'
  })

  // 9. Horizontal rules (---, ***, ___) -> paragraph break.
  text = text.replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')

  // 10. Inline code: keep inner text, strip backticks. Handle 1+ backtick fences.
  text = text.replace(/(`+)([^`]+?)\1/g, '$2')

  // 11. HTML tags: strip <tag> and </tag>, keep inner text.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '')

  // 12. Emphasis markers: strip **, __, *, _ around runs of text.
  //     Order matters: doubles first, then singles.
  text = text.replace(/(\*\*|__)([^\s*_][\s\S]*?[^\s*_]|[^\s*_])\1/g, '$2')
  text = text.replace(/(\*|_)([^\s*_][\s\S]*?[^\s*_]|[^\s*_])\1/g, '$2')

  // 13. Normalize whitespace: collapse 3+ newlines to exactly 2 (paragraph break).
  //     Trim trailing whitespace on each line.
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()

  return text
}

// Tables: detect a header row, separator row, and data rows. Emit "Header: Cell, ..." per data row.
function transformTables(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const headerLine = lines[i]
    const sepLine = i + 1 < lines.length ? lines[i + 1] : ''

    if (isTableRow(headerLine) && isTableSeparator(sepLine)) {
      const headers = splitTableRow(headerLine)
      i += 2 // skip header + separator

      while (i < lines.length && isTableRow(lines[i])) {
        const cells = splitTableRow(lines[i])
        const sentence = headers
          .map((h, idx) => `${h}: ${cells[idx] ?? ''}`)
          .join(', ')
        out.push(sentence + '.')
        i++
      }
      continue
    }

    out.push(lines[i])
    i++
  }

  return out.join('\n')
}

function isTableRow(line: string): boolean {
  if (!line) return false
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false
  // Each cell must contain only -, :, and spaces.
  return splitTableRow(line).every((c) => /^:?-+:?$/.test(c.trim()))
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1) // drop outer pipes
    .split('|')
    .map((c) => c.trim())
}
