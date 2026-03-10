/**
 * Strip color-injection vectors from AI-generated mermaid source.
 *
 * Mermaid converts `style` directives into inline `style` attributes with
 * `!important`, which defeats any themeCSS overrides. Removing these
 * directives lets the app's OKLCH dark-mode palette take effect.
 */
export function sanitizeMermaidChart(chart: string): string {
  return chart
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
}
