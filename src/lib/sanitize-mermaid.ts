/**
 * Strip color-injection vectors from AI-generated mermaid source.
 *
 * Mermaid converts `style` directives into inline `style` attributes with
 * `!important`, which defeats any themeCSS overrides. Removing these
 * directives lets the app's OKLCH dark-mode palette take effect.
 */
export function sanitizeMermaidChart(chart: string): string {
  const stripped = chart
    .split('\n')
    .filter(line => {
      const trimmed = line.trimStart()
      // `style nodeA fill:#e1f5fe,stroke:#333`
      if (/^style\s+\S+/i.test(trimmed)) return false
      // `classDef highlight fill:#fff3e0`
      if (/^classDef\s+\S+/i.test(trimmed)) return false
      // `class A,B highlight`
      if (/^class\s+[\w,]+\s+\w+/i.test(trimmed)) return false
      return true
    })
    .map(line => line.replace(/:::\w+/g, ''))
    .join('\n')
  return quoteMermaidLabels(stripped)
}

/** Lines that should never be rewritten by the label-quoting pass. */
const SKIP_LINE =
  /^\s*(%%|graph\b|flowchart\b|subgraph\b|end\b|direction\b|click\b|linkStyle\b)/i

/**
 * Node-shape patterns ordered so double-delimiter shapes are matched first.
 * Each tuple: [regex, openDelim, closeDelim].
 * Capture groups: ($1 = nodeId, $2 = unquoted label text).
 */
const SHAPE_PATTERNS: [RegExp, string, string][] = [
  [/(\b[\w-]+)\[\[([^\]"]+?)\]\]/g, '[[', ']]'],   // subroutine
  [/(\b[\w-]+)\(\(([^)"]+?)\)\)/g, '((', '))'],     // double circle
  [/(\b[\w-]+)\{\{([^}"]+?)\}\}/g, '{{', '}}'],     // hexagon
  [/(\b[\w-]+)\[\(([^)"]+?)\)\]/g, '[(', ')]'],     // cylinder
  [/(\b[\w-]+)\[\/([^\]"]+?)\/\]/g, '[/', '/]'],    // parallelogram
  [/(\b[\w-]+)\[([^[\]"]+?)\]/g, '[', ']'],        // rectangle
  [/(\b[\w-]+)\(([^()"]+?)\)/g, '(', ')'],          // rounded
  [/(\b[\w-]+)\{([^{}"]+?)\}/g, '{', '}'],          // diamond
  [/(\b[\w-]+)>([^\]"]+?)\]/g, '>', ']'],           // asymmetric
]

/**
 * Wrap every unquoted node label in double quotes so that special characters
 * (colons, ampersands, slashes, `<br/>`, etc.) don't break mermaid parsing.
 */
export function quoteMermaidLabels(chart: string): string {
  return chart
    .split('\n')
    .map(line => {
      if (SKIP_LINE.test(line)) return line
      for (const [re, open, close] of SHAPE_PATTERNS) {
        re.lastIndex = 0
        line = line.replace(re, (_match, id, label) => {
          return `${id}${open}"${label}"${close}`
        })
      }
      return line
    })
    .join('\n')
}
