/**
 * Removes a trailing unclosed ```mermaid fence from streaming markdown text.
 *
 * Why: react-markdown still surfaces an unclosed fenced block to CodeBlock
 * mid-stream. For regular code blocks this is fine (partial code renders as
 * text), but MermaidDiagram throws on every keystroke until the chart parses,
 * producing a noisy "Failed to render diagram" flash. Hiding the block until
 * the closing ``` arrives gives a clean blank-space placeholder instead.
 */
export function stripStreamingUnclosedMermaid(text: string): string {
  // Match fence openers/closers at the start of a line (allow up to 3 leading spaces, per CommonMark).
  const fenceRegex = /^ {0,3}```([^\n`]*)$/gm
  const fences: Array<{ index: number; lang: string }> = []
  let m: RegExpExecArray | null
  while ((m = fenceRegex.exec(text)) !== null) {
    fences.push({ index: m.index, lang: m[1].trim() })
  }

  // Odd count → final fence is an opener without a closer.
  if (fences.length % 2 !== 1) return text
  const lastOpen = fences[fences.length - 1]
  if (lastOpen.lang.toLowerCase() !== 'mermaid') return text
  return text.slice(0, lastOpen.index)
}
