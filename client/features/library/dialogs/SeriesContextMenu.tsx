import type { Dispatch } from 'react'
import { Pencil } from 'lucide-react'
import type { DialogAction, LibraryMenu } from '@client/features/library/dialogs/dialog-machine'

interface SeriesContextMenuProps {
  menu: Extract<LibraryMenu, { kind: 'series' }>
  dispatch: Dispatch<DialogAction>
}

/** The right-click menu for a series stack. Opening the rename dialog
 * dismisses this menu as a side effect of the reducer's `open` action. */
export function SeriesContextMenu({ menu, dispatch }: SeriesContextMenuProps) {
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
      <button
        onClick={() => dispatch({
          type: 'open',
          dialog: { kind: 'renameSeries', seriesName: menu.seriesName, books: menu.books, newName: menu.seriesName },
        })}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
      >
        <Pencil className="size-3.5 text-content-muted shrink-0" />
        Rename Series
      </button>
    </div>
  )
}
