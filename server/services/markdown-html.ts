import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { visit, SKIP } from 'unist-util-visit'
import type { Root, Element, Text, RootContent } from 'hast'

type ParentNode = Root | Element

export interface MarkdownToHtmlResult {
  html: string
  mermaidBlocks: Array<{ placeholder: string; source: string }>
}

// Default processor — unchanged behavior for existing call sites
const defaultProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify)

/**
 * rehype plugin that finds rendered KaTeX elements and inserts a hidden
 * sibling containing the original LaTeX source. This preserves the source
 * for later extraction in EPUB post-processing.
 */
function rehypePreserveKatexSources() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (index === undefined || !parent) return

      const el = node as Element
      const classes = Array.isArray(el.properties?.className)
        ? (el.properties.className as string[])
        : []

      const isDisplayMath = classes.includes('katex-display')
      const isInlineMath = !isDisplayMath && el.tagName === 'span' && classes.includes('katex')

      if (!isDisplayMath && !isInlineMath) return

      // Find the <annotation encoding="application/x-tex"> element inside the katex tree
      let texSource = ''
      visit(el, 'element', (child) => {
        const childEl = child as Element
        if (
          childEl.tagName === 'annotation' &&
          childEl.properties?.encoding === 'application/x-tex'
        ) {
          texSource = extractText(childEl)
        }
      })

      if (!texSource) return

      const tutorClass = isDisplayMath ? 'tutor-katex-display' : 'tutor-katex-inline'
      const tag = isDisplayMath ? 'div' : 'span'

      // Insert a hidden element after the katex node with the raw source
      const sourceNode: RootContent = {
        type: 'element',
        tagName: tag,
        properties: {
          className: [tutorClass],
          style: 'display:none',
        },
        children: [{ type: 'text', value: texSource }],
      }

      const parentNode = parent as ParentNode
      parentNode.children.splice(index + 1, 0, sourceNode)

      // Skip the inserted node to avoid revisiting it
      return [SKIP, index + 2] as const
    })
  }
}

/**
 * rehype plugin that extracts mermaid code blocks, replaces them with
 * placeholder divs, and collects the source into an array attached to
 * the vfile.
 */
function rehypeExtractMermaid() {
  return (tree: Root, file: { data: Record<string, unknown> }) => {
    const mermaidBlocks: Array<{ placeholder: string; source: string }> = []

    visit(tree, 'element', (node, index, parent) => {
      if (index === undefined || !parent) return

      const el = node as Element
      if (el.tagName !== 'pre') return

      // Check if this <pre> contains a <code class="language-mermaid">
      const codeChild = el.children.find(
        (child): child is Element =>
          child.type === 'element' &&
          child.tagName === 'code' &&
          Array.isArray((child as Element).properties?.className) &&
          ((child as Element).properties!.className as string[]).includes('language-mermaid'),
      )

      if (!codeChild) return

      const source = extractText(codeChild).trim()
      const placeholderKey = `__MERMAID_PLACEHOLDER_${mermaidBlocks.length}__`
      mermaidBlocks.push({ placeholder: placeholderKey, source })

      // Replace the <pre> node with a placeholder div
      const placeholderNode: RootContent = {
        type: 'element',
        tagName: 'div',
        properties: {
          'data-mermaid-placeholder': placeholderKey,
        },
        children: [{ type: 'text', value: placeholderKey }],
      }

      const parentNode = parent as ParentNode
      parentNode.children[index] = placeholderNode
    })

    file.data.mermaidBlocks = mermaidBlocks
  }
}

/** Recursively extract text content from a hast node */
function extractText(node: Element | Text): string {
  if (node.type === 'text') return node.value
  if ('children' in node) {
    return (node.children as (Element | Text)[]).map(extractText).join('')
  }
  return ''
}

// EPUB processor — adds math rendering + source preservation + mermaid extraction
const epubProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypePreserveKatexSources)
  .use(rehypeExtractMermaid)
  .use(rehypeStringify)

// Overloaded signatures for type safety
export function markdownToHtml(md: string): Promise<string>
export function markdownToHtml(md: string, opts: { preserveSources: true }): Promise<MarkdownToHtmlResult>
export async function markdownToHtml(
  md: string,
  opts?: { preserveSources?: boolean },
): Promise<string | MarkdownToHtmlResult> {
  if (opts?.preserveSources) {
    const file = await epubProcessor.process(md)
    const mermaidBlocks = (file.data.mermaidBlocks as MarkdownToHtmlResult['mermaidBlocks']) ?? []
    return {
      html: String(file),
      mermaidBlocks,
    }
  }

  const result = await defaultProcessor.process(md)
  return String(result)
}
