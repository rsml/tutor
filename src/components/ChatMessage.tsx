import { SafeMarkdown } from '@src/components/SafeMarkdown'
import type { ChatMessage as ChatMessageType } from '@src/hooks/useStreamingChat'

interface ChatMessageProps {
  message: ChatMessageType
  selectedText?: string
  isFirst?: boolean
}

export function ChatMessage({ message, selectedText, isFirst }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          {isFirst && selectedText && (
            <div className="mb-1.5 rounded-lg rounded-br-md border-l-2 border-border-focus/60 bg-surface-muted/50 px-3 py-2 text-xs text-content-muted">
              "{selectedText.length > 150 ? selectedText.slice(0, 150) + '...' : selectedText}"
            </div>
          )}
          <div className="rounded-2xl rounded-br-md bg-[oklch(0.55_0.20_285)] px-3.5 py-2 text-sm text-white">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-2 text-sm text-content-primary">
        {message.content ? (
          <div className="prose-sm prose-neutral dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <SafeMarkdown>{message.content}</SafeMarkdown>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 py-0.5">
            <span className="size-1.5 rounded-full bg-content-muted animate-[typing-dot_1.4s_ease-in-out_infinite]" />
            <span className="size-1.5 rounded-full bg-content-muted animate-[typing-dot_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="size-1.5 rounded-full bg-content-muted animate-[typing-dot_1.4s_ease-in-out_0.4s_infinite]" />
          </span>
        )}
      </div>
    </div>
  )
}
