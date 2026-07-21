import { z } from 'zod'
import { PreferencesSchema, SkillSchema } from './domain.js'
import { ProviderSchema, MODEL_REGEX } from './provider.js'

/**
 * The HTTP request and response shapes the client and server agree on.
 *
 * The entities the app persists and renders live in shared/domain.ts
 * instead. ProviderSchema now lives in shared/provider.ts and is re-exported
 * here so existing imports of it from this module keep working.
 */

export { ProviderSchema }

const ModelSchema = z.string().min(1).max(100).regex(MODEL_REGEX)

/**
 * The {model, provider} pair every AI-backed request carries. Most schemas
 * below extend this rather than repeating the two fields, which is also why
 * model here goes through ModelSchema's regex rather than a bare string.
 * StartBookBodySchema and ReviseTocBodySchema are the exceptions, see the
 * note on ReviseTocBodySchema below for why they do not extend this.
 */
export const AiRequestSchema = z.object({
  model: ModelSchema,
  provider: ProviderSchema.optional(),
})

export const UpdateProfileBodySchema = z.object({
  aboutMe: z.string().max(2000),
  preferences: PreferencesSchema,
  skills: z.array(SkillSchema).max(50).default([]),
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

/**
 * ReviseTocBodySchema and StartBookBodySchema below both take model and
 * provider as bare strings instead of extending AiRequestSchema, so neither
 * validates model against MODEL_REGEX or provider against the ProviderSchema
 * enum the way every other AI-backed body in this file does. Worth
 * confirming that gap is intentional before relying on either body having
 * already rejected a malformed model or an unknown provider by the time a
 * handler sees it.
 */
export const ReviseTocBodySchema = z.object({
  feedback: z.string().min(1).max(4000),
  model: z.string().min(1),
  provider: z.string().min(1).optional(),
})

export const StartBookBodySchema = z.object({
  model: z.string().min(1),
  provider: z.string().min(1).optional(),
  quizModel: z.string().min(1).optional(),
  quizProvider: z.string().min(1).optional(),
  quizLength: z.number().int().min(1).max(10).optional(),
})

export const FinalQuizBodySchema = AiRequestSchema

/**
 * Every field here is tri-state, not just optional. Omitting a field leaves
 * that part of the book untouched, matching ordinary PATCH semantics. series,
 * seriesOrder, and sortOrder additionally accept an explicit null, which
 * means clear the value, so a caller has to be able to tell "leave series
 * alone" apart from "remove series" and only one of the two spellings
 * expresses each.
 */
export const PatchBookBodySchema = z.object({
  title: z.string().min(1).max(100).optional(),
  subtitle: z.string().max(150).optional(),
  showTitleOnCover: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  series: z.string().min(1).max(100).nullable().optional(),   // null to remove
  seriesOrder: z.number().int().min(1).nullable().optional(),  // null to remove
  sortOrder: z.number().nullable().optional(),                  // null to remove
})

export const ImportEpubBodySchema = z.object({
  base64: z.string().max(15_000_000), // ~10MB encoded
  filename: z.string().min(1).max(255),
})

export const ImportEpubPreviewResponseSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  chapterCount: z.number().int().min(0),
  hasCover: z.boolean(),
  coverBase64: z.string().optional(),
})

export const ImportEpubConfirmBodySchema = z.object({
  base64: z.string().max(15_000_000),
  filename: z.string().min(1).max(255),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  series: z.string().min(1).max(100).optional(),
  seriesOrder: z.number().int().min(1).optional(),
})

/**
 * finalQuizScore and finalQuizTotal are capped at 100 here. domain.ts's
 * BookMetaSchema persists the same two fields with no upper bound at all, so
 * that cap only ever applies on the way in through this request, not to a
 * book read back off disk.
 */
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

export const SuggestCoverPromptBodySchema = AiRequestSchema

export const SuggestDetailsBodySchema = AiRequestSchema.extend({
  topic: z.string().min(1).max(500),
})

export const GenerateAudiobookBodySchema = z.object({
  voiceId: z.string().min(1).max(100).optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  confirmReplace: z.boolean().optional(),
  rememberAsDefault: z.boolean().optional(),
})

export const SuggestBookBodySchema = AiRequestSchema.extend({
  mode: z.enum(['deepen', 'complementary']).optional(),
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
