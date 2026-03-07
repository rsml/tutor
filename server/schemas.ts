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
