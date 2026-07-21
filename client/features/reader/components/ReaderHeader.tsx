import { BarChart3, MessageSquare } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import { SettingsMenu } from '@client/features/settings/components/SettingsMenu'

interface ReaderHeaderProps {
  title: string
  onQuizReview?: () => void
  chatOpen: boolean
  onChatToggle: () => void
}

export function ReaderHeader({ title, onQuizReview, chatOpen: _chatOpen, onChatToggle }: ReaderHeaderProps) {
  return (
    <header
      className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
        {title}
      </span>

      {/* Right controls */}
      <div
        className="ml-auto flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {onQuizReview && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onQuizReview}
            aria-label="Quiz review"
            className="text-content-faint hover:text-content-muted"
          >
            <BarChart3 className="size-4" />
          </Button>
        )}
        <SettingsMenu subtle />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onChatToggle}
          aria-label="Toggle chat"
          className="text-content-faint hover:text-content-muted"
        >
          <MessageSquare className="size-4" />
        </Button>
      </div>
    </header>
  )
}
