import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Sparkles, Loader2, TrendingUp, Puzzle, Dices } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@src/components/ui/dropdown-menu'
import { TickSlider } from '@src/components/ui/tick-slider'
import { useAppSelector, selectFunctionModel, selectHasApiKey, selectDefaultChapterCount } from '@src/store'
import { apiUrl } from '@src/lib/api-base'
import { store } from '@src/store'

const CHAPTER_COUNTS = [1, 3, 6, 12, 25, 50]
const CHAPTER_LABELS = ['Essay', 'Short', 'Novella', 'Standard', 'Long', 'Epic']

const COVER_STYLES = [
  'Minimalist pen-and-ink illustration on cream background, reminiscent of classic O\'Reilly animal covers',
  'Bold typographic cover with subtle geometric patterns, inspired by Penguin Classics design language',
  'Atmospheric watercolor composition with soft gradients, evoking literary fiction aesthetics',
  'Clean vector illustration with a limited 2-3 color palette, contemporary tech publishing style',
  'Photographic still life or detail study with dramatic lighting, premium non-fiction presentation',
  'Abstract geometric composition with muted earth tones, modernist academic press style',
  'Hand-drawn scientific or botanical illustration, scholarly naturalist aesthetic',
  'Textured linen background with elegant gold-foil-style accents, premium hardcover feel',
]

const RANDOM_TOPICS = [
  'How to Stop Overthinking',
  'Better Sleep for Overthinkers',
  'Personal Finance Without the Boring Parts',
  'How to Make Friends as an Adult',
  'How to Stop Procrastinating',
  'How to Be More Confident',
  'How to Lose Weight Without Extremes',
  'How to Be More Articulate',
  'How to Build Healthy Habits That Stick',
  'How to Talk to Anyone',
  'How to Stop Doomscrolling',
  'How to Get Your Life Organized',
  'How to Build Discipline Without Self-Hatred',
  'How to Reduce Stress Before It Runs Your Life',
  'Strength Training for Complete Beginners',
  'How to Speak Up in Meetings',
  'How to Build Wealth Slowly and Sanely',
  'How to Feel Less Tired All the Time',
  'How to Date With More Clarity',
  'Public Speaking Without Sounding Fake',
  'How to Get Out of Credit Card Debt',
  'How to Stop People-Pleasing',
  'Cooking Basics for People Who Hate Recipes',
  'How to Feel Better in Your Body',
  'How to Have Better Conversations',
  'How to Stop Comparing Yourself to Others',
  'How to Set Boundaries Without Guilt',
  'How to Build a Better Morning Routine',
  'How to Cook Healthy Food That Actually Tastes Good',
  'How to Become More Emotionally Mature',
  'How to Fix Your Attention Span',
  'How to Stop Feeling Behind in Life',
  'How to Build a Career You Actually Want',
  'How to Eat More Protein Without Overcomplicating It',
  'How to Be Funny on Purpose',
  'How to Handle Anxiety in Everyday Life',
  'How to Build Quiet Confidence',
  'How to Start Investing Without Feeling Dumb',
  'How to Get Better at Your Job Fast',
  'How to Read People and Social Situations Better',
  'How to Stop Self-Sabotaging',
  'How to Build Better Routines',
  'How to Improve Your Posture',
  'How to Communicate Clearly Under Pressure',
  'How to Stop Rambling',
  'How to Become Less Socially Awkward',
  'How to Make Better Decisions',
  'How to Learn Anything Faster',
  'Nutrition Basics Without Food Obsession',
  'How to Stop Being So Hard on Yourself',
  'How to Handle Conflict Without Shutting Down',
  'How to Save Money Automatically',
  'How to Build Focus in a Distracted World',
  'How to Stop Emotional Eating',
  'How to Build a Better Relationship',
  'How to Stop Avoiding Hard Things',
  'Walking Your Way to Better Health',
  'How to Rebuild Your Attention in the Smartphone Era',
  'How to Become More Disciplined',
  'How to Stop Wasting Weekends',
  'How to Dress Better Without Chasing Trends',
  'How to Build Self-Trust',
  'How to Build a Life You\'re Proud Of',
  'How to Negotiate Without Feeling Aggressive',
  'How to Get Better Sleep',
  'How to Stop Taking Everything Personally',
  'How to Build an Emergency Fund',
  'How to Get Unstuck When Life Feels Flat',
  'How to Have Deep Conversations',
  'How to Become More Interesting',
  'How to Stop Analysis Paralysis',
  'How to Plan Your Week Realistically',
  'How to Build a Stronger Back and Core',
  'How to Make Better First Impressions',
  'How to Create a Home That Feels Calm',
  'How to Cook Better Chicken',
  'How to Become a Better Listener',
  'How to Stop Seeking Constant Reassurance',
  'How to Build Mental Toughness Without Going Numb',
  'How to Use ChatGPT Well',
  'How to Build Better Money Habits',
  'How to Reduce Back Pain From Desk Work',
  'How to Become More Charismatic',
  'How to Manage Your Time Like an Adult',
  'How to Feel More Comfortable in Your Own Skin',
  'How to Build a Richer Social Life',
  'How to Recover From Burnout',
  'How to Upgrade Your Everyday Style',
  'How to Be Less Reactive',
  'How to Think More Clearly',
  'How to Stop Impulse Spending',
  'How to Build Consistency in Exercise',
  'How to Stop Perfectionism From Running Your Life',
  'How to Ask Better Questions',
  'How to Build Confidence in the Gym',
  'How to Stop Feeling Lonely',
  'How to Build Better Habits After 30',
  'How to Write Clearly at Work',
  'How to Get Promoted',
  'How to Build a Simple Personal Finance System',
  'How to Eat Well on a Budget',
  'How to Handle Rejection Better',
  'How to Make New Friends After Moving',
  'How to Improve Digestion With Everyday Habits',
  'How to Stop Numbing Out on Your Phone',
  'How to Build a Better Evening Routine',
  'How to Communicate in Relationships Without Escalating',
  'How to Build a Stronger Sense of Self',
  'How to Cook Without a Recipe',
  'How to Make Your Home Less Chaotic',
  'How to Become More Decisive',
  'How to Protect Your Energy',
  'How to Start Running Without Hating It',
  'How to Stop Feeling Scattered',
  'How to Build Momentum When Motivation Dies',
  'How to Get Better at Small Talk',
  'How to Improve Your Credit Score',
  'How to Organize Your Digital Life',
  'How to Become More Resilient',
  'How to Dress Casually but Well',
  'How to Learn AI Without the Hype',
  'How to Stop Living on Autopilot',
  'How to Build Better Boundaries at Work',
  'How to Make Healthy Choices When You\'re Busy',
  'How to Build Emotional Intelligence at Work',
  'How to Stop Overexplaining',
  'How to Create a Better Life Admin System',
  'How to Feel More Grounded',
  'How to Build Strength at Home',
  'How to Become More Secure in Yourself',
  'How to Make Better Friends, Not Just More Friends',
  'How to Plan Meals Without Overthinking It',
  'How to Get More Done Without Feeling Frantic',
  'How to Stop Catastrophizing',
  'How to Build Confidence Before Presentations',
  'How to Understand Your Money in Plain English',
  'How to Stop Letting Clutter Drain You',
  'How to Build a Better Relationship With Food',
  'How to Become Less Intimidated by Difficult Conversations',
  'How to Talk Less and Say More',
  'How to Read More Books',
  'How to Make Your Days Feel Intentional',
  'How to Stop Ruining Good Days With Bad Thought Loops',
  'How to Build a Better Wardrobe With Fewer Clothes',
  'How to Build Daily Systems Instead of Relying on Willpower',
  'How to Deal With Difficult Family Members',
  'How to Build a Healthier Mindset Around Fitness',
  'How to Understand Investing From Scratch',
  'How to Learn Faster at Work',
  'How to Become More Approachable',
  'How to Build Confidence After a Setback',
  'How to Build Better Sleep Hygiene',
  'How to Stop Letting Anxiety Make Your Decisions',
  'How to Feel Less Overwhelmed by Adulthood',
  'How to Stop Eating Like Stress Is in Charge',
  'How to Be More Persuasive Without Being Manipulative',
  'How to Organize Your House Realistically',
  'How to Build a More Attractive Presence',
  'How to Build a Workout Routine You\'ll Actually Keep',
  'How to Have Standards Without Becoming Rigid',
  'How to Handle Criticism Gracefully',
  'How to Stop Living Paycheck to Paycheck',
  'How to Build Better Weekend Rituals',
  'How to Become the Kind of Person Who Finishes Things',
  'How to Build a Stronger Attention Span',
  'How to Be Better at Parties and Group Settings',
  'How to Improve Your Skin and Grooming Routine Simply',
  'How to Make Better Coffee at Home',
  'How to Stop Overthinking Texts and Social Interactions',
  'How to Build Better Career Leverage',
  'How to Move On After a Breakup',
  'How to Be More Playful in Conversation',
  'How to Build a Simpler, Cleaner Life',
  'How to Start Cooking for Yourself',
  'How to Build a Stronger Body After Years of Sitting',
  'How to Stop Quitting on Yourself',
  'How to Be More Comfortable Being Seen',
  'How to Recover From Embarrassment Faster',
  'How to Make a Budget You\'ll Actually Follow',
  'How to Build a Morning Routine That Doesn\'t Suck',
  'How to Build Better Friendships as a Busy Adult',
  'How to Stop Being Chronically Distracted',
  'How to Build a Home Office That Helps You Focus',
  'How to Become More Intentional With Your Time',
  'How to Improve Your Communication in Dating',
  'How to Build Stronger Boundaries With Family',
  'How to Learn Machine Learning Without the Math Panic',
  'How to Stop Feeling Like You\'re Wasting Your Potential',
  'How to Get Better at Networking Without Feeling Fake',
  'How to Build More Calm Into Daily Life',
  'How to Cook Vegetables That Taste Good',
  'How to Build Confidence in Social Settings',
  'How to Think in Trade-Offs',
  'How to Create a Life You Don\'t Need to Escape From',
  'How to Build Better Habits After a Bad Month',
  'How to Be More Likable Without Performing',
  'How to Stop Letting Your Phone Win',
  'How to Understand Taxes Without Panic',
  'How to Build Better Conflict Skills',
  'How to Become More Self-Aware',
  'How to Get Your Apartment or House Under Control',
  'How to Stop Making Easy Things Hard',
  'How to Build Better Daily Energy',
  'How to Become More Calm Under Pressure',
  'How to Speak With More Presence',
  'How to Build a Real Reading Habit',
  'How to Start Therapy Work on Yourself Even Before Therapy',
  'How to Build Financial Confidence',
  'How to Make Exercise Feel Less Like Punishment',
  'How to Build a More Magnetic Social Presence',
  'How to Stop Feeling Guilty When You Rest',
  'How to Build Better Personal Style as a Man',
  'How to Build Better Personal Style as a Woman',
  'How to Create Better To-Do Lists',
  'How to Stop Living Reactively',
  'How to Build a Better Relationship With Uncertainty',
  'How to Build Stamina for Everyday Life',
  'How to Make More Interesting Conversation',
  'How to Recover From a Bad Year',
  'How to Build Better Money Conversations With Your Partner',
  'How to Become Less Passive in Your Own Life',
  'How to Build Better Food Discipline Without Obsession',
  'How to Stop Feeling Invisible Socially',
  'How to Learn Python by Building Useful Things',
  'How to Build Better Decision-Making Under Uncertainty',
  'How to Build a More Grown-Up Life Operating System',
  'How to Stop Turning to Productivity Content Instead of Action',
  'How to Build Better Emotional Regulation',
  'How to Create More Connection in a Long-Term Relationship',
  'How to Build a Stronger Sense of Purpose',
  'How to Travel More Without Spending a Fortune',
  'How to Build Better Deep Work Habits',
  'How to Stop Letting Shame Run Your Life',
  'How to Build Better Self-Respect',
  'How to Understand Nutrition Labels and Food Marketing',
  'How to Stop Letting Fear Decide for You',
  'How to Build a Better Closet Without Buying More Junk',
  'How to Become More Resourceful',
  'How to Make Better Use of AI at Work',
  'How to Build a Social Life You\'re Actually Excited About',
  'How to Build Better Routines for Couples',
  'How to Create a Better Weekly Reset',
  'How to Build Better Systems for Recurring Tasks',
  'How to Become More Comfortable With Ambition',
  'How to Learn Rust by Building Real Tools',
  'How to Build Better Taste',
  'How to Create More Fun in Adult Life',
  'How to Build a Better Relationship With Yourself',
  'How to Build a Life Around What Actually Matters',
  'How to Become More Fully Alive',
]

interface WizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (topic: string, details: string, chapterCount: number, coverPrompt?: string) => void
}

export function WizardModal({ open, onOpenChange, onCreate }: WizardModalProps) {
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')
  const [suggestingTopic, setSuggestingTopic] = useState(false)
  const [suggestingDetails, setSuggestingDetails] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [generateCover, setGenerateCover] = useState(false)
  const [coverDescription, setCoverDescription] = useState('')
  const defaultChapterCount = useAppSelector(selectDefaultChapterCount)
  const [chapterCountIndex, setChapterCountIndex] = useState(() => {
    const idx = CHAPTER_COUNTS.indexOf(defaultChapterCount)
    return idx >= 0 ? idx : CHAPTER_COUNTS.indexOf(12)
  })
  const { provider, model } = useAppSelector(selectFunctionModel('profile'))
  const hasApiKey = useAppSelector(selectHasApiKey)

  // Reset chapter count when default changes or dialog opens
  useEffect(() => {
    if (open) {
      const idx = CHAPTER_COUNTS.indexOf(defaultChapterCount)
      setChapterCountIndex(idx >= 0 ? idx : CHAPTER_COUNTS.indexOf(12))
    }
  }, [open, defaultChapterCount])

  const handleCreate = () => {
    if (!topic.trim()) return
    onOpenChange(false)
    const coverPromptValue = generateCover
      ? (coverDescription.trim() || (() => {
          const style = COVER_STYLES[Math.floor(Math.random() * COVER_STYLES.length)]
          return `Elegant book cover. ${style}. Subject: ${details.trim() || topic.trim()}. Professional publishing quality, no text or lettering on the image.`
        })())
      : undefined
    onCreate(topic.trim(), details.trim(), CHAPTER_COUNTS[chapterCountIndex], coverPromptValue)
    setTopic('')
    setDetails('')
    setReasoning(null)
    setGenerateCover(false)
    setCoverDescription('')
  }

  const handleSuggestTopic = async (mode: 'deepen' | 'complementary') => {
    if (!hasApiKey || suggestingTopic) return
    setSuggestingTopic(true)
    setReasoning(null)

    try {
      const state = store.getState()
      const quizHistory = state.quizHistory?.quizzes ?? undefined

      const res = await fetch(apiUrl('/api/books/suggest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider, quizHistory, mode }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || 'Suggestion failed')
      }

      const data = await res.json()
      setTopic(data.topic)
      if (data.reasoning) setReasoning(data.reasoning)
    } catch (err) {
      toast.error('Failed to suggest topic: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSuggestingTopic(false)
    }
  }

  const handleSurpriseMe = () => {
    const pick = RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)]
    setTopic(pick)
    setReasoning(null)
  }

  const handleSuggestDetails = async () => {
    if (!hasApiKey || suggestingDetails || !topic.trim()) return
    setSuggestingDetails(true)

    try {
      const res = await fetch(apiUrl('/api/books/suggest-details'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), model, provider }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || 'Suggestion failed')
      }

      const data = await res.json()
      setDetails(data.details)
    } catch (err) {
      toast.error('Failed to suggest details: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSuggestingDetails(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader className="items-center text-center">
          <DialogTitle className="text-xl">New Book</DialogTitle>
          <DialogDescription>
            What do you want to learn next?
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

        <div className="grid gap-4">
          {reasoning && (
            <p className="text-xs text-content-muted italic leading-relaxed bg-surface-muted/50 rounded-md px-3 py-2">
              {reasoning}
            </p>
          )}

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="topic" className="text-sm font-medium text-content-primary">
                Topic
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={!hasApiKey || suggestingTopic}
                  className="flex items-center gap-1 text-xs text-[var(--color-ai)] hover:text-[var(--color-ai-hover)] disabled:opacity-50 cursor-default"
                >
                  {suggestingTopic ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  Suggest
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto">
                  <DropdownMenuItem onClick={() => handleSuggestTopic('deepen')}>
                    <TrendingUp className="size-4" />
                    Deepen existing skills
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSuggestTopic('complementary')}>
                    <Puzzle className="size-4" />
                    Learn complementary skills
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSurpriseMe}>
                    <Dices className="size-4" />
                    Surprise me
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <input
              id="topic"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g., Machine Learning, Strength Training, Public Speaking"
              className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="details" className="text-sm font-medium text-content-primary">
                Details
                <span className="text-xs font-normal text-content-muted ml-1">(optional)</span>
              </label>
              <button
                type="button"
                onClick={handleSuggestDetails}
                disabled={!hasApiKey || suggestingDetails || !topic.trim()}
                className="flex items-center gap-1 text-xs text-[var(--color-ai)] hover:text-[var(--color-ai-hover)] disabled:opacity-50"
              >
                {suggestingDetails ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                Suggest
              </button>
            </div>
            <textarea
              id="details"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Any specific areas to focus on, your experience level, or goals..."
              rows={20}
              className="min-h-[8rem] rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
          </div>

          {/* Chapter count slider */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-content-primary">Length</span>
              <span className="text-xs text-content-muted">
                {CHAPTER_COUNTS[chapterCountIndex]} {CHAPTER_COUNTS[chapterCountIndex] === 1 ? 'chapter' : 'chapters'}
                <span className="ml-1.5 text-content-muted/60">{CHAPTER_LABELS[chapterCountIndex]}</span>
              </span>
            </div>
            <TickSlider
              min={0}
              max={CHAPTER_COUNTS.length - 1}
              value={chapterCountIndex}
              onChange={setChapterCountIndex}
              ticks={CHAPTER_COUNTS.map((count, i) => ({
                label: CHAPTER_LABELS[i],
                highlight: count === defaultChapterCount,
              }))}
            />
          </div>
        </div>

        </ScrollableDialogBody>
        <ScrollableDialogFooter className="justify-end">
          <Button
            variant="primary"
            size="lg"
            disabled={!topic.trim()}
            onClick={handleCreate}
            className="font-semibold"
          >
            Create
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
