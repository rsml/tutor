export function QuizReviewPage({ book, onBack, onBackToReader }: {
  book: { id: string; title: string; totalChapters: number }
  onBack: () => void
  onBackToReader: () => void
}) {
  return (
    <div className="flex h-screen items-center justify-center text-content-primary">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Quiz Review — {book.title}</h1>
        <p className="mt-2 text-sm text-content-muted">Coming soon</p>
        <button onClick={onBack} className="mt-4 text-sm text-content-muted hover:text-content-secondary">
          Back to library
        </button>
      </div>
    </div>
  )
}
