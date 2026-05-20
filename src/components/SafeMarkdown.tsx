import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import { CodeBlock } from './CodeBlock'

// Hoisted to module scope so identical arrays/objects are passed to ReactMarkdown
// on every render — otherwise its internal memoization can't short-circuit and
// the markdown is fully reparsed (with rehype-highlight + rehype-katex) on every
// parent render, which is expensive on full chapters.
const REMARK_PLUGINS = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]] as const
const REHYPE_PLUGINS = [rehypeHighlight, rehypeKatex] as const
const COMPONENTS = { pre: CodeBlock }

function SafeMarkdownInner({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS as never}
      rehypePlugins={REHYPE_PLUGINS as never}
      components={COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  )
}

export const SafeMarkdown = memo(SafeMarkdownInner)
