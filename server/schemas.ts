import { z } from 'zod'

// --- Learning Profile ---

export const LearningProfileSchema = z.object({
  style: z.string(),
  identity: z.string(),
  preferences: z.object({
    explainComplexTermsSimply: z.boolean(),
    assumePriorKnowledge: z.boolean(),
    codeExamples: z.boolean(),
    realWorldAnalogies: z.boolean(),
  }),
})

export type LearningProfile = z.infer<typeof LearningProfileSchema>

export const UpdateProfileBodySchema = z.object({
  aboutMe: z.string().max(2000),
  preferences: z.object({
    explainComplexTermsSimply: z.boolean(),
    assumePriorKnowledge: z.boolean(),
    codeExamples: z.boolean(),
    realWorldAnalogies: z.boolean(),
  }),
})

// --- Table of Contents ---

export const TocChapterSchema = z.object({
  title: z.string(),
  description: z.string(),
})

export const TocSchema = z.object({
  chapters: z.array(TocChapterSchema),
})

export type TocChapter = z.infer<typeof TocChapterSchema>
export type Toc = z.infer<typeof TocSchema>

// --- Book Meta ---

export const BookStatusSchema = z.enum([
  'generating_toc',
  'toc_review',
  'generating',
  'reading',
  'complete',
])

export type BookStatus = z.infer<typeof BookStatusSchema>

export const BookMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: BookStatusSchema,
  totalChapters: z.number().int().positive(),
  generatedUpTo: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  profileOverrides: z.record(z.string(), z.unknown()).optional(),
  rating: z.number().min(0).max(5).multipleOf(0.5).optional(),
  finalQuizScore: z.number().int().min(0).optional(),
  finalQuizTotal: z.number().int().min(0).optional(),
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

// --- Request Body Schemas ---

export const ProviderSchema = z.enum(['anthropic', 'openai', 'google'])

const ModelSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9._:\/-]{1,100}$/)

export const AiRequestSchema = z.object({
  model: ModelSchema,
  provider: ProviderSchema.optional(),
})

export const CreateBookBodySchema = AiRequestSchema.extend({
  topic: z.string().min(1).max(500),
  details: z.string().max(2000).optional(),
})

export const FeedbackBodySchema = z.object({
  liked: z.string().max(2000).optional(),
  disliked: z.string().max(2000).optional(),
  quizAnswers: z.array(z.number().int().min(0).max(3)).max(20).optional(),
})

export const GenerateNextBodySchema = AiRequestSchema

export const FinalQuizBodySchema = AiRequestSchema

export const PatchBookBodySchema = z.object({
  title: z.string().min(1).max(300),
})

export const RatingBodySchema = z.object({
  rating: z.number().min(0).max(5).multipleOf(0.5),
  finalQuizScore: z.number().int().min(0).max(100).optional(),
  finalQuizTotal: z.number().int().min(0).max(100).optional(),
})

export const ChatBodySchema = AiRequestSchema.extend({
  chapterContent: z.string().max(100_000),
  selectedText: z.string().max(5000),
  userMessage: z.string().min(1).max(5000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(10_000),
  })).max(50),
})

export const SetApiKeyBodySchema = z.object({
  provider: ProviderSchema,
  apiKey: z.string().min(1).max(500),
})

export const RemoveApiKeyBodySchema = z.object({
  provider: ProviderSchema,
})
