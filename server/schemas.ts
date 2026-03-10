import { z } from 'zod'

// --- Learning Profile ---

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
})

export const SkillSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().int().min(1).max(10),
})

export type Preferences = z.infer<typeof PreferencesSchema>

export const LearningProfileSchema = z.object({
  style: z.string(),
  identity: z.string(),
  preferences: PreferencesSchema,
  skills: z.array(SkillSchema).max(50).default([]),
})

export type LearningProfile = z.infer<typeof LearningProfileSchema>

export const UpdateProfileBodySchema = z.object({
  aboutMe: z.string().max(2000),
  preferences: PreferencesSchema,
  skills: z.array(SkillSchema).max(50).default([]),
})


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
  subtitle: z.string().optional(),
  prompt: z.string(),
  status: BookStatusSchema,
  totalChapters: z.number().int().positive(),
  generatedUpTo: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  profileOverrides: z.record(z.string(), z.unknown()).optional(),
  showTitleOnCover: z.boolean().optional(),
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

const ModelSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9._:/-]{1,100}$/)

export const AiRequestSchema = z.object({
  model: ModelSchema,
  provider: ProviderSchema.optional(),
})

export const InterviewChatBodySchema = AiRequestSchema.extend({
  userMessage: z.string().min(1).max(5000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(10_000),
  })).max(50),
})

export const CompleteProfileSchema = z.object({
  aboutMe: z.string(),
  preferences: PreferencesSchema,
  skills: z.array(SkillSchema).max(50).default([]),
})

export const CreateBookBodySchema = AiRequestSchema.extend({
  topic: z.string().min(1),
  details: z.string().optional(),
  chapterCount: z.number().int().min(1).max(50).optional(),
  quizModel: ModelSchema.optional(),
  quizProvider: ProviderSchema.optional(),
  quizLength: z.number().int().min(1).max(10).optional(),
})

export const FeedbackBodySchema = z.object({
  liked: z.string().max(2000).optional(),
  disliked: z.string().max(2000).optional(),
  quizAnswers: z.array(z.number().int().min(0).max(3)).max(20).optional(),
})

export const GenerateNextBodySchema = AiRequestSchema.extend({
  quizModel: ModelSchema.optional(),
  quizProvider: ProviderSchema.optional(),
  quizLength: z.number().int().min(1).max(10).optional(),
})

export const FinalQuizBodySchema = AiRequestSchema

export const PatchBookBodySchema = z.object({
  title: z.string().min(1).max(100).optional(),
  subtitle: z.string().max(150).optional(),
  showTitleOnCover: z.boolean().optional(),
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

export const SuggestSkillsBodySchema = AiRequestSchema.extend({
  aboutMe: z.string().max(2000),
  existingSkills: z.array(SkillSchema).max(50).default([]),
})

export const GenerateCoverBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  provider: ProviderSchema,
  model: z.string().min(1).max(100),
})

export const UploadCoverBodySchema = z.object({
  base64: z.string().max(15_000_000), // ~10MB encoded
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
})

export const SuggestBookBodySchema = AiRequestSchema.extend({
  quizHistory: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        questions: z.array(z.object({
          question: z.string(),
          options: z.array(z.string()),
          correctIndex: z.number(),
        })),
        attempts: z.array(z.object({
          score: z.number(),
          timestamp: z.string().optional(),
          answers: z.array(z.object({
            selectedAnswer: z.number(),
            correct: z.boolean(),
          })),
        })),
      }),
    ),
  ).optional(),
})
