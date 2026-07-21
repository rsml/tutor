import { LibraryPage } from '@client/features/library/LibraryPage'
import { ReaderPage } from '@client/features/reader/ReaderPage'
import { QuizReviewPage } from '@client/features/quiz/QuizReviewPage'
import { ReviewProgressPage } from '@client/features/progress/ReviewProgressPage'
import { SkillDetailPage } from '@client/features/progress/SkillDetailPage'
import { ProfileUpdatePage } from '@client/features/profile/ProfileUpdatePage'
import { CreationView } from '@client/features/creation/components/CreationView'
import { useBooks } from '@client/features/library/hooks/useBooks'
import { useHealthCheck } from '@client/features/library/hooks/useHealthCheck'
import { useElectronApiKeys } from '@client/features/library/hooks/useElectronApiKeys'
import { useBackgroundTaskEffects } from '@client/features/library/hooks/useBackgroundTaskEffects'
import { useLibraryNavigation } from '@client/features/library/hooks/useLibraryNavigation'
import { persistor, useAppDispatch, setLastViewedBookId } from '@client/store'

export default function App() {
  const { books, setBooks, hasLoaded, fetchBooks, addOptimisticBook } = useBooks()
  const serverAvailable = useHealthCheck()
  useElectronApiKeys()
  const audiobook = useBackgroundTaskEffects({ books, fetchBooks })
  const nav = useLibraryNavigation({ books, setBooks, hasLoaded, fetchBooks })
  const dispatch = useAppDispatch()
  const { view } = nav

  if (view.type === 'creating') {
    return (
      <CreationView
        mode="create"
        topic={view.topic}
        details={view.details}
        chapterCount={view.chapterCount}
        onComplete={nav.handleCreationComplete}
        onCancel={nav.handleCreationCancel}
        onBookCreated={addOptimisticBook}
      />
    )
  }

  if (view.type === 'resuming') {
    return (
      <CreationView
        mode="resume"
        bookId={view.bookId}
        onComplete={nav.handleCreationComplete}
        onCancel={nav.handleCreationCancel}
      />
    )
  }

  if (view.type === 'reading') {
    return (
      <ReaderPage
        book={view.book}
        onBack={() => {
          dispatch(setLastViewedBookId(null))
          persistor.flush().catch(() => {})
          fetchBooks()
          nav.goToLibrary()
        }}
        onQuizReview={() => nav.goToQuizReview(view.book)}
        onUpdateProfile={() => nav.goToProfileUpdate(view.book.id, view.book.title)}
      />
    )
  }

  if (view.type === 'quiz-review') {
    return (
      <QuizReviewPage
        book={view.book}
        onBack={() => { fetchBooks(); nav.goToLibrary() }}
        onBackToReader={() => nav.goToReading(view.book)}
      />
    )
  }

  if (view.type === 'review-progress') {
    return (
      <ReviewProgressPage
        onBack={nav.goToLibrary}
        onSkillClick={nav.goToSkillDetail}
      />
    )
  }

  if (view.type === 'skill-detail') {
    return (
      <SkillDetailPage
        skillName={view.skillName}
        onBack={nav.goToReviewProgress}
      />
    )
  }

  if (view.type === 'profile-update') {
    return (
      <ProfileUpdatePage
        bookId={view.bookId}
        bookTitle={view.bookTitle}
        onComplete={() => { fetchBooks(); nav.goToLibrary() }}
      />
    )
  }

  return (
    <LibraryPage
      books={books}
      setBooks={setBooks}
      hasLoaded={hasLoaded}
      fetchBooks={fetchBooks}
      serverAvailable={serverAvailable}
      onOpenBook={nav.openBook}
      onCreateBook={nav.handleCreate}
      onQuizReview={nav.goToQuizReview}
      onReviewProgress={nav.goToReviewProgress}
      audiobook={audiobook}
    />
  )
}
