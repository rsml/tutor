import type { Dispatch } from 'react'
import { EditTagsDialog } from '@client/features/library/dialogs/EditTagsDialog'
import { SetSeriesDialog } from '@client/features/library/dialogs/SetSeriesDialog'
import { BookOverviewModal } from '@client/features/library/dialogs/BookOverviewModal'
import { CoverGenerationModal } from '@client/features/library/dialogs/CoverGenerationModal'
import { GenerateAllModal } from '@client/features/library/dialogs/GenerateAllModal'
import { RenameBookDialog } from '@client/features/library/dialogs/RenameBookDialog'
import { RenameSeriesDialog } from '@client/features/library/dialogs/RenameSeriesDialog'
import { DeleteBookDialog } from '@client/features/library/dialogs/DeleteBookDialog'
import { ResetBookDialog } from '@client/features/library/dialogs/ResetBookDialog'
import { RateBookDialog } from '@client/features/library/dialogs/RateBookDialog'
import { AudiobookDownloadModal } from '@client/features/audiobook/components/AudiobookDownloadModal'
import { AudiobookVoiceModal } from '@client/features/audiobook/components/AudiobookVoiceModal'
import { AudiobookRegenerateConfirmModal } from '@client/features/audiobook/components/AudiobookRegenerateConfirmModal'
import { isOpen, payloadOf } from '@client/features/library/dialogs/dialog-machine'
import type { DialogAction, DialogState } from '@client/features/library/dialogs/dialog-machine'
import type { AudiobookEffects } from '@client/features/library/hooks/useBackgroundTaskEffects'

interface LibraryDialogsProps {
  dialogState: DialogState
  dispatchDialog: Dispatch<DialogAction>
  mutating: boolean
  allTags: string[]
  allSeriesNames: string[]
  fetchBooks: () => Promise<void>
  audiobook: AudiobookEffects
  onRename: () => void
  onRenameSeries: () => void
  onDelete: () => void
  onReset: () => void
  onRate: () => void
  onClearRating: () => void
  onSaveTags: (bookId: string, tags: string[]) => void
  onSaveSeries: (bookId: string, series: string | null, seriesOrder: number | null) => void
}

/**
 * Every dialog the library page renders regardless of whether the grid, the
 * list, or a drilled-into series view is showing above it. Bundled into one
 * component so LibraryPage does not render this same list twice for its two
 * return branches, matching the single shared `renderDialogs()` helper this
 * replaces.
 *
 * The three audiobook modals are untouched by the dialog reducer on purpose.
 * Their state lives in useBackgroundTaskEffects, owned by App.tsx, because an
 * install can finish minutes after it starts, often while this page has been
 * unmounted in favor of the reader.
 */
export function LibraryDialogs({
  dialogState,
  dispatchDialog,
  mutating,
  allTags,
  allSeriesNames,
  fetchBooks,
  audiobook,
  onRename,
  onRenameSeries,
  onDelete,
  onReset,
  onRate,
  onClearRating,
  onSaveTags,
  onSaveSeries,
}: LibraryDialogsProps) {
  // These four unmount entirely on close (no exit animation), matching their
  // pre-reducer behavior, so their payload must go null the instant the
  // dialog is no longer the active one rather than lingering through exiting.
  const editTagsPayload = isOpen(dialogState, 'editTags') ? payloadOf(dialogState, 'editTags') : null
  const setSeriesPayload = isOpen(dialogState, 'setSeries') ? payloadOf(dialogState, 'setSeries') : null
  const coverPayload = isOpen(dialogState, 'cover') ? payloadOf(dialogState, 'cover') : null
  const generateAllPayload = isOpen(dialogState, 'generateAll') ? payloadOf(dialogState, 'generateAll') : null
  // Always mounted, so this one is read with a plain payloadOf: it should
  // keep showing the last book while the dialog fades out.
  const overviewPayload = payloadOf(dialogState, 'overview')

  return (
    <>
      <RenameBookDialog
        open={isOpen(dialogState, 'rename')}
        payload={payloadOf(dialogState, 'rename')}
        dispatch={dispatchDialog}
        mutating={mutating}
        onConfirm={onRename}
      />

      <RenameSeriesDialog
        open={isOpen(dialogState, 'renameSeries')}
        payload={payloadOf(dialogState, 'renameSeries')}
        dispatch={dispatchDialog}
        mutating={mutating}
        onConfirm={onRenameSeries}
      />

      <DeleteBookDialog
        open={isOpen(dialogState, 'delete')}
        payload={payloadOf(dialogState, 'delete')}
        dispatch={dispatchDialog}
        mutating={mutating}
        onConfirm={onDelete}
      />

      <ResetBookDialog
        open={isOpen(dialogState, 'reset')}
        payload={payloadOf(dialogState, 'reset')}
        dispatch={dispatchDialog}
        mutating={mutating}
        onConfirm={onReset}
      />

      <RateBookDialog
        open={isOpen(dialogState, 'rate')}
        payload={payloadOf(dialogState, 'rate')}
        dispatch={dispatchDialog}
        mutating={mutating}
        onConfirm={onRate}
        onClearRating={onClearRating}
      />

      {/* Edit Tags dialog */}
      {editTagsPayload && (
        <EditTagsDialog
          open={true}
          onOpenChange={(open) => { if (!open) dispatchDialog({ type: 'close' }) }}
          bookId={editTagsPayload.book.id}
          currentTags={editTagsPayload.book.tags}
          allTags={allTags}
          onSave={onSaveTags}
        />
      )}

      {/* Set Series dialog */}
      {setSeriesPayload && (
        <SetSeriesDialog
          open={true}
          onOpenChange={(open) => { if (!open) dispatchDialog({ type: 'close' }) }}
          bookId={setSeriesPayload.book.id}
          currentSeries={setSeriesPayload.book.series}
          currentSeriesOrder={setSeriesPayload.book.seriesOrder}
          allSeriesNames={allSeriesNames}
          onSave={onSaveSeries}
        />
      )}

      {/* Book overview modal */}
      <BookOverviewModal
        open={isOpen(dialogState, 'overview')}
        onOpenChange={(open) => { if (!open) dispatchDialog({ type: 'close' }) }}
        book={overviewPayload?.book ?? { id: '', title: '', totalChapters: 0 }}
      />

      {/* Cover generation modal */}
      {coverPayload && (
        <CoverGenerationModal
          open={true}
          onOpenChange={(open) => { if (!open) dispatchDialog({ type: 'close' }) }}
          bookId={coverPayload.book.id}
          bookTitle={coverPayload.book.title}
          bookTopic={coverPayload.book.prompt ?? coverPayload.book.title}
          hasCover={coverPayload.book.hasCover}
          showTitleOnCover={coverPayload.book.showTitleOnCover}
          onCoverChanged={fetchBooks}
        />
      )}

      {/* Generate all modal */}
      {generateAllPayload && (
        <GenerateAllModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              dispatchDialog({ type: 'close' })
              fetchBooks()
            }
          }}
          taskId={generateAllPayload.taskId}
          bookTitle={generateAllPayload.book.title}
          totalChapters={generateAllPayload.book.totalChapters}
        />
      )}

      {/* Audiobook download modal */}
      {audiobook.audiobookDownloadModal && (
        <AudiobookDownloadModal
          open
          onOpenChange={(open) => { if (!open) { audiobook.setAudiobookDownloadModal(null); audiobook.setPendingAudiobookForBookId(null) } }}
          missing={audiobook.audiobookDownloadModal.missing}
          missingBytes={audiobook.audiobookDownloadModal.missingBytes}
          onConfirm={audiobook.handleConfirmDownload}
        />
      )}

      {/* Audiobook voice modal */}
      {audiobook.audiobookVoiceModal && (
        <AudiobookVoiceModal
          open
          onOpenChange={(open) => { if (!open) audiobook.setAudiobookVoiceModal(null) }}
          bookId={audiobook.audiobookVoiceModal.book.id}
          bookTitle={audiobook.audiobookVoiceModal.book.title}
          mode={audiobook.audiobookVoiceModal.mode}
        />
      )}

      {/* Audiobook regenerate confirm modal */}
      {audiobook.regenerateAudiobookConfirm && (
        <AudiobookRegenerateConfirmModal
          open
          onOpenChange={(open) => { if (!open) audiobook.setRegenerateAudiobookConfirm(null) }}
          bookTitle={audiobook.regenerateAudiobookConfirm.book.title}
          onConfirm={audiobook.handleConfirmRegenerateAudiobook}
        />
      )}
    </>
  )
}
