/**
 * Shared formatting rules appended to every system prompt that produces
 * markdown rendered by the app's KaTeX-enabled markdown pipeline
 * (see `src/components/SafeMarkdown.tsx` and `server/services/markdown-html.ts`).
 *
 * The renderer is configured with `singleDollarTextMath: false`, so a single
 * `$...$` is treated as literal text (e.g., currency renders correctly). LaTeX
 * math must use `$$...$$` instead. This rule tells the AI to match that
 * convention so any intentional math actually renders.
 */
export const MARKDOWN_FORMATTING_RULES = `
## Markdown formatting rules

- Write literal dollar signs in monetary amounts (\`$5K\`, \`$100\`, \`$1.2M\`), shell variables (\`$PATH\`), and regex anchors as plain \`$\` — no escaping needed. The renderer treats a single \`$\` as literal text.
- For any mathematical expression — equations, formulas, variables with subscripts/superscripts, vectors, integrals, summations, etc. — you MUST use LaTeX inside double dollar signs \`$$...$$\`. The renderer uses KaTeX and will typeset it properly. Do NOT substitute Unicode math characters (e.g., \`vₓ\`, \`√\`, \`∫\`, \`Δ\`, \`×\`, \`·\`, \`²\`) — these look amateurish and inconsistent. Use proper LaTeX: \`$$v_x$$\`, \`$$\\sqrt{x}$$\`, \`$$\\int f(x)\\,dx$$\`, \`$$\\Delta v$$\`, \`$$\\mathbf{a} \\times \\mathbf{b}$$\`, \`$$\\mathbf{a} \\cdot \\mathbf{b}$$\`, \`$$x^2$$\`.
- Display math (centered, on its own line) requires the \`$$\` markers to be on their OWN lines with the math content between them:
  \`\`\`
  $$
  |\\mathbf{v}| = \\sqrt{v_x^2 + v_y^2 + v_z^2}
  $$
  \`\`\`
- Inline math (in the middle of a sentence) uses single-line \`$$...$$\` with the math on the same line: \`the vector $$\\mathbf{v}$$ has magnitude $$|\\mathbf{v}|$$\`. A standalone \`$$...$$\` on one line (without surrounding prose) renders as inline math, NOT display math — use the three-line form above for centered display equations.
- Single-dollar math (\`$x^2$\`) is disabled in the renderer and would appear as literal text — never use it.
`.trim()
