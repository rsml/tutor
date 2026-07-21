import type { Dispatch } from 'react'
import { Pencil, Star, Tags, Library, Eye, ClipboardCheck, Image, Zap, Download, Headphones, FolderOpen, RotateCcw, Trash2 } from 'lucide-react'
import type { AudiobookEffects } from '@client/features/library/hooks/useBackgroundTaskEffects'
import type { LibraryBook } from '@shared/responses'
import type { DialogAction, LibraryMenu } from '@client/features/library/dialogs/dialog-machine'

interface BookContextMenuProps {
  menu: Extract<LibraryMenu, { kind: 'book' }>
  dispatch: Dispatch<DialogAction>
  onQuizReview: (book: LibraryBook) => void
  onGenerateAll: (book: LibraryBook) => void
  onExportEpub: (book: LibraryBook) => void
  audiobook: AudiobookEffects
}

/**
 * The right-click menu for a single book card or row.
 *
 * Every item that leads to a library dialog opens it by dispatching directly,
 * which also dismisses this menu as a side effect of the reducer's `open`
 * action. Items that do not open a dialog (quiz review, generate all, export,
 * and every audiobook action, since those live in the audiobook effects hook
 * rather than this reducer) close the menu explicitly instead, matching what
 * this menu did before it was a reducer.
 */
export function BookContextMenu({ menu, dispatch, onQuizReview, onGenerateAll, onExportEpub, audiobook }: BookContextMenuProps) {
  const { book } = menu
  return (
    <div
      ref={(el) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        let x = menu.x
        let y = menu.y
        if (x + rect.width > vw - 8) x = menu.x - rect.width
        if (y + rect.height > vh - 8) y = menu.y - rect.height
        if (x < 8) x = 8
        if (y < 8) y = 8
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      }}
      className="fixed z-50 w-fit rounded-lg border border-border-default/50 bg-surface-base/95 backdrop-blur-md py-1 shadow-lg"
      style={{ left: -9999, top: -9999 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Edit group */}
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'rename', book, title: book.title, subtitle: book.subtitle ?? '' } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Pencil className="size-3.5 text-content-muted shrink-0" />
        Rename
      </button>
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'rate', book, rating: book.rating ?? 0 } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Star className="size-3.5 text-content-muted shrink-0" />
        Rate
      </button>
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'editTags', book } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Tags className="size-3.5 text-content-muted shrink-0" />
        Edit Tags
      </button>
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'setSeries', book } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Library className="size-3.5 text-content-muted shrink-0" />
        Set Series
      </button>
      <div className="my-1 h-px bg-border-default/50" />
      {/* View group */}
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'overview', book } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Eye className="size-3.5 text-content-muted shrink-0" />
        Book Overview
      </button>
      <button
        onClick={() => { onQuizReview(book); dispatch({ type: 'closeMenu' }) }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <ClipboardCheck className="size-3.5 text-content-muted shrink-0" />
        Quiz Review
      </button>
      <div className="my-1 h-px bg-border-default/50" />
      {/* Actions group */}
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'cover', book } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Image className="size-3.5 text-content-muted shrink-0" />
        Edit Cover
      </button>
      <button
        onClick={() => { onGenerateAll(book); dispatch({ type: 'closeMenu' }) }}
        disabled={book.generatedUpTo >= book.totalChapters}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        <Zap className="size-3.5 text-content-muted shrink-0" />
        Generate All Chapters
      </button>
      <button
        onClick={() => { onExportEpub(book); dispatch({ type: 'closeMenu' }) }}
        disabled={book.generatedUpTo < book.totalChapters}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        <Download className="size-3.5 text-content-muted shrink-0" />
        Export EPUB
      </button>
      {book.generatedUpTo < book.totalChapters ? (
        <button
          disabled
          className="flex flex-col items-start gap-0 w-full px-3 py-1.5 text-left text-sm text-content-primary disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <div className="flex items-center gap-2">
            <Headphones className="size-3.5 text-content-muted shrink-0" />
            Generate audiobook
          </div>
          <span className="ml-5 pl-0.5 text-xs text-content-muted">Finish generating chapters first</span>
        </button>
      ) : (audiobook.audiobookExists.get(book.id) === true || book.hasAudiobook === true) ? (
        <>
          <button
            onClick={() => { audiobook.handleShowAudiobook(book); dispatch({ type: 'closeMenu' }) }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            <FolderOpen className="size-3.5 text-content-muted shrink-0" />
            Show audiobook
          </button>
          <button
            onClick={() => { audiobook.setRegenerateAudiobookConfirm({ book }); dispatch({ type: 'closeMenu' }) }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            <Headphones className="size-3.5 text-content-muted shrink-0" />
            Generate new audiobook…
          </button>
        </>
      ) : (
        <button
          onClick={() => { audiobook.handleGenerateAudiobook(book); dispatch({ type: 'closeMenu' }) }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
        >
          <Headphones className="size-3.5 text-content-muted shrink-0" />
          Generate audiobook
        </button>
      )}
      <div className="my-1 h-px bg-border-default/50" />
      {/* Danger group */}
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'reset', book, input: '' } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <RotateCcw className="size-3.5 shrink-0" />
        Reset
      </button>
      <button
        onClick={() => dispatch({ type: 'open', dialog: { kind: 'delete', book, input: '' } })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-status-error hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Trash2 className="size-3.5 shrink-0" />
        Delete
      </button>
    </div>
  )
}
