import { z } from 'zod'
import { BOOK_STATUSES, type BookStatus } from './book-status.js'
import { ProviderSchema, MODEL_REGEX } from './provider.js'

/**
 * Built here rather than in `shared/book-status.ts` so that module can stay
 * free of zod. The client imports its predicates, and a value import of zod
 * there would ship the validator in the renderer bundle. Derived from the
 * BOOK_STATUSES tuple, so the schema and the predicates cannot drift.
 */
export const BookStatusSchema = z.enum(BOOK_STATUSES)

/**
 * The entities the app persists and renders: learning profile, table of
 * contents, book metadata, reading progress, quiz and feedback, chapter
 * summaries, reference manifests, and the audiobook manifest.
 *
 * The HTTP request and response shapes the client and server agree on live
 * in shared/contracts.ts instead.
 */

// --- Learning Profile ---

export const AudiobookPreferencesSchema = z.object({
  defaultVoiceId: z.string().min(1).max(100),
  defaultSpeed: z.number().min(0.5).max(2.0),
  workerOverride: z.number().int().min(1).max(32).optional(),
})

export type AudiobookPreferences = z.infer<typeof AudiobookPreferencesSchema>

export const PreferencesSchema = z.object({
  // Booleans (6)
  explainComplexTermsSimply: z.boolean().default(true),
  codeExamples: z.boolean().default(true),
  realWorldAnalogies: z.boolean().default(true),
  includeRecaps: z.boolean().default(true),
  includeSummaries: z.boolean().default(true),
  visualDescriptions: z.boolean().default(false),
  // Sliders (1-5 integer scale, 6)
  depthLevel: z.number().int().min(1).max(5).default(3),
  pacePreference: z.number().int().min(1).max(5).default(3),
  metaphorDensity: z.number().int().min(1).max(5).default(3),
  narrativeStyle: z.number().int().min(1).max(5).default(3),
  humorLevel: z.number().int().min(1).max(5).default(2),
  formalityLevel: z.number().int().min(1).max(5).default(3),
  // Audiobook narration defaults (optional — set after first generation)
  audiobook: AudiobookPreferencesSchema.optional(),
})

export const SkillSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().int().min(1).max(10),
})

export type Preferences = z.infer<typeof PreferencesSchema>

export const LearningProfileSchema = z.object({
  /**
   * Which schema version this profile was last written at. Optional rather
   * than defaulted on purpose: a `.default()` here would make the field
   * required in LearningProfile's inferred type, forcing every existing
   * object literal typed as LearningProfile across the codebase to name a
   * version number it has no business knowing. Left optional, an absent
   * field parses exactly as version 1 always has, and every one of those
   * call sites is untouched.
   *
   * This schema does not stamp anything current. That happens on the write
   * side, in fs-book-repository's saveProfile, which sets this field to
   * CURRENT_PROFILE_SCHEMA_VERSION on every write, so anything the running
   * app produces is current by construction. The migrator that upgrades an
   * old file reads the raw YAML below this schema either way, so this
   * optional field can never fool it into treating an unmigrated file as
   * already current.
   */
  schemaVersion: z.number().int().positive().optional(),
  style: z.string(),
  identity: z.string(),
  preferences: PreferencesSchema,
  skills: z.array(SkillSchema).max(50).default([]),
})

export type LearningProfile = z.infer<typeof LearningProfileSchema>

// --- Table of Contents ---

export const TocBookSkillSchema = z.object({
  name: z.string().min(1).max(100),
  weight: z.number().int().min(1).max(5),
})

export const TocChapterSkillSchema = z.object({
  skill: z.string().min(1).max(100),
  subskill: z.string().min(1).max(100),
  weight: z.number().int().min(1).max(3),
})

export const TocChapterSchema = z.object({
  title: z.string(),
  description: z.string(),
  skills: z.array(TocChapterSkillSchema).optional(),
})

export const TocSchema = z.object({
  skills: z.array(TocBookSkillSchema).optional(),
  chapters: z.array(TocChapterSchema),
})

export type TocChapter = z.infer<typeof TocChapterSchema>
export type Toc = z.infer<typeof TocSchema>

// --- Book Meta ---

export { type BookStatus }

export const BookMetaSchema = z.object({
  /**
   * Which schema version this book folder was last written at. Optional
   * rather than defaulted on purpose: a `.default()` here would make the
   * field required in BookMeta's inferred type, and BookMeta is built as
   * an object literal at dozens of call sites across the server that have
   * no business knowing a version number. Left optional, an absent field
   * parses exactly as version 1 always has, and every one of those call
   * sites is untouched.
   *
   * This schema does not stamp anything current. That happens on the write
   * side, in fs-book-repository's saveBook, which sets this field to
   * CURRENT_BOOK_SCHEMA_VERSION on every write, so anything the running
   * app produces is current by construction. The migrator that upgrades an
   * old file reads the raw YAML below this schema either way, so this
   * optional field can never fool it into treating an unmigrated file as
   * already current.
   */
  schemaVersion: z.number().int().positive().optional(),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  prompt: z.string(),
  status: BookStatusSchema,
  totalChapters: z.number().int().min(1).max(500),
  generatedUpTo: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  profileOverrides: z.record(z.string(), z.unknown()).optional(),
  showTitleOnCover: z.boolean().optional(),
  rating: z.number().min(0).max(5).multipleOf(0.5).optional(),
  finalQuizScore: z.number().int().min(0).optional(),
  finalQuizTotal: z.number().int().min(0).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
  series: z.string().min(1).max(100).optional(),
  seriesOrder: z.number().int().min(1).optional(),
  sortOrder: z.number().optional(),
  imported: z.boolean().optional(),
  audioGeneratedChapters: z.array(z.number().int().positive()).default([]),
})

export type BookMeta = z.infer<typeof BookMetaSchema>

// --- Progress ---

export const ChapterProgressSchema = z.object({
  scroll: z.number().min(0).max(1),
  completed: z.boolean(),
  completedAt: z.string().optional(),
})

export const ProgressSchema = z.object({
  chapters: z.record(z.string(), ChapterProgressSchema),
})

export type ChapterProgress = z.infer<typeof ChapterProgressSchema>
export type Progress = z.infer<typeof ProgressSchema>

// --- Quiz & Feedback ---

export const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  userAnswer: z.number().int().min(0).max(3).optional(),
  correct: z.boolean().optional(),
})

export const FeedbackSchema = z.object({
  chapter: z.number().int().positive(),
  feedback: z.object({
    liked: z.string().optional(),
    disliked: z.string().optional(),
  }),
  quiz: z.object({
    questions: z.array(QuizQuestionSchema),
    score: z.number().int().min(0).optional(),
  }),
})

export const QuizSchema = z.object({
  questions: z.array(QuizQuestionSchema),
})

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>
export type Quiz = z.infer<typeof QuizSchema>
export type Feedback = z.infer<typeof FeedbackSchema>

// --- Chapter Summaries ---

export const ChapterSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
})
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>

// --- References ---

export const ReferenceEntrySchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  heading: z.string().optional(),
  tokenEstimate: z.number().int().optional(),
})
export type ReferenceEntry = z.infer<typeof ReferenceEntrySchema>

export const ReferenceManifestSchema = z.array(ReferenceEntrySchema)
export type ReferenceManifest = z.infer<typeof ReferenceManifestSchema>

// --- Audiobook ---

export const AudiobookChapterEntrySchema = z.object({
  num: z.number().int().positive(),
  title: z.string(),
  mp3Path: z.string(),
  durationSec: z.number().nonnegative(),
  startSec: z.number().nonnegative(),
})

export const AudiobookManifestSchema = z.object({
  version: z.number().int().positive(),
  voice: z.string(),
  speed: z.number().min(0.5).max(2.0),
  generatedAt: z.string(),
  m4bPath: z.string(),
  chapters: z.array(AudiobookChapterEntrySchema),
})

export type AudiobookChapterEntry = z.infer<typeof AudiobookChapterEntrySchema>
export type AudiobookManifest = z.infer<typeof AudiobookManifestSchema>

// --- Generation jobs ---

/**
 * The on-disk shape of an in-flight background job, written by
 * server/adapters/journalled-background-tasks.ts through
 * server/ports/job-journal.ts so a job interrupted by a crash or restart
 * can be found and resumed the next time the app starts. It deliberately
 * carries only what restarting the job needs, a task type, which book,
 * how far it got, and the handful of request parameters that chose its
 * provider, model, and voice. An API key is never among that. A key
 * proves who is asking, and belongs in KeyVault alone, restarting a job
 * needs to know what was asked for, not who paid for it, and this journal
 * is written to disk unencrypted, unlike KeyVault's storage.
 */

/**
 * Every TaskType in shared/responses.ts, plus 'generate-chapter' for the
 * just-in-time single chapter generation that never went through
 * BackgroundTasks before this journal existed. Pinned together with
 * TaskType by the compile-time guard in shared/generation-job.test.ts,
 * which cannot live in this module without importing shared/responses.ts
 * and creating a cycle, responses.ts already imports from here.
 */
export const GENERATION_JOB_TYPES = [
  'generate-all',
  'generate-epub',
  'generate-cover',
  'install-audiobook',
  'generate-audiobook',
  'generate-chapter',
] as const

export const GenerationJobTypeSchema = z.enum(GENERATION_JOB_TYPES)
export type GenerationJobType = z.infer<typeof GenerationJobTypeSchema>

/** How far a job got before it stopped, enough to resume without redoing finished work. */
export const GenerationJobCheckpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('chapters'), through: z.number().int().min(0) }),
  z.object({ kind: z.literal('narration-complete') }),
])

export type GenerationJobCheckpoint = z.infer<typeof GenerationJobCheckpointSchema>

/**
 * The request parameters a job needs to restart, the same handful a
 * client already chooses in shared/contracts.ts's request bodies.
 * z.strictObject rather than z.object, so a future field added here
 * without matching thought, an API key above all, fails to parse instead
 * of silently being written to disk.
 */
export const GenerationJobParamsSchema = z.strictObject({
  provider: ProviderSchema.optional(),
  model: z.string().min(1).max(100).regex(MODEL_REGEX).optional(),
  quizProvider: ProviderSchema.optional(),
  quizModel: z.string().min(1).max(100).regex(MODEL_REGEX).optional(),
  quizLength: z.number().int().min(1).max(10).optional(),
  voiceId: z.string().min(1).max(100).optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  targetChapterNum: z.number().int().positive().optional(),
})

export type GenerationJobParams = z.infer<typeof GenerationJobParamsSchema>

export const GenerationJobSchema = z.object({
  id: z.string(),
  type: GenerationJobTypeSchema,
  bookId: z.string(),
  bookTitle: z.string(),
  /**
   * Deliberately a plain string, not TaskStatus, domain.ts cannot import
   * shared/responses.ts. Whatever is written here at record time is never
   * trusted on read anyway, JobJournal.listInterrupted() always reports
   * 'interrupted', so this field only needs to round-trip, not to mean
   * anything on its own.
   */
  status: z.string(),
  checkpoint: GenerationJobCheckpointSchema,
  params: GenerationJobParamsSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
})

export type GenerationJob = z.infer<typeof GenerationJobSchema>
