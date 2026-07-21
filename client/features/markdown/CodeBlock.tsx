import { useState, useCallback, type ReactElement, type ComponentPropsWithoutRef } from 'react'
import { Copy, Check } from 'lucide-react'
import { MermaidDiagram } from '@client/features/markdown/MermaidDiagram'
import { COPY_RESET_MS } from '@client/lib/constants'

type PreProps = ComponentPropsWithoutRef<'pre'>

export function CodeBlock({ children, ...props }: PreProps) {
  const [copied, setCopied] = useState(false)

  // Extract language and text from the <code> child
  const codeElement = children as ReactElement<{ className?: string; children?: string }>
  const className = codeElement?.props?.className ?? ''
  const match = className.match(/language-(\w+)/)
  const language = match?.[1] ?? ''
  const code = String(codeElement?.props?.children ?? '').replace(/\n$/, '')

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_RESET_MS)
  }, [code])

  if (language === 'mermaid') {
    return <MermaidDiagram chart={code} />
  }

  return (
    <div className="code-block-wrapper group relative">
      {language && (
        <span className="code-block-lang">{language}</span>
      )}
      <button
        onClick={handleCopy}
        className="code-block-copy"
        aria-label="Copy code"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <pre {...props}>{children}</pre>
    </div>
  )
}
