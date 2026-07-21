import { useEffect, useRef, useState } from 'react'
import { Settings, Sun, Moon, Monitor, Type, User, BarChart3, Sliders, MoveHorizontal, ListOrdered, BookOpen, Headphones } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuGroup,
} from '@client/components/ui/dropdown-menu'
import { ApiKeyDialog } from '@client/features/settings/components/ApiKeyDialog'
import { SettingsSlider } from '@client/features/settings/components/SettingsSlider'
import { TextureControl } from '@client/features/settings/components/TextureControl'
import { ModelAssignmentDialog } from '@client/features/settings/components/ModelAssignmentDialog'
import { ProfileDialog } from '@client/features/profile/components/ProfileDialog'
import { InterviewPanel } from '@client/features/profile/components/InterviewPanel'
import { SkillsPanel } from '@client/features/profile/components/SkillsPanel'
import { AudiobookSettingsDialog } from '@client/features/audiobook/components/AudiobookSettingsDialog'
import { useTheme } from '@client/features/settings/components/ThemeProvider'
import {
  useAppDispatch,
  useAppSelector,
  selectHasApiKey,
  selectActiveProvider,
  selectProviders,
  selectFontSize,
  selectReadingWidth,
  selectQuizLength,
  selectTextureEnabled,
  selectTextureOpacity,
  selectDefaultChapterCount,
  setActiveProvider,
  setProviderApiKey,
  setFontSize,
  setReadingWidth,
  READING_WIDTHS,
  DEFAULT_READING_WIDTH,
  setQuizLength,
  setDefaultChapterCount,
  setTextureEnabled,
  setTextureOpacity,
  selectModelAssignmentSeen,
  setModelAssignmentSeen,
} from '@client/store'
import { PROVIDERS, type ProviderId } from '@client/lib/providers'
import { removeApiKey, saveApiKey } from '@client/api'
import { API_KEY_DEBOUNCE_MS } from '@client/lib/constants'
import { useLearningProfile } from '@client/features/profile/hooks/useLearningProfile'

const CHAPTER_COUNTS = [1, 3, 6, 12, 25, 50]
const CHAPTER_LABELS = ['Essay', 'Short', 'Novella', 'Standard', 'Long', 'Epic']
const DEFAULT_CHAPTER_COUNT = 12

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 20, 22]
const DEFAULT_FONT_SIZE = 16

const READING_WIDTH_LABELS = ['Narrow', 'Medium', 'Default', 'Wide', 'Extra Wide', 'Full']

interface SettingsMenuProps {
  apiKeyDialogOpen?: boolean
  onApiKeyDialogClose?: () => void
  onReviewProgress?: () => void
  subtle?: boolean
}

export function SettingsMenu({ apiKeyDialogOpen, onApiKeyDialogClose, onReviewProgress, subtle }: SettingsMenuProps = {}) {
  const { theme, setTheme } = useTheme()
  const dispatch = useAppDispatch()
  const hasApiKey = useAppSelector(selectHasApiKey)
  const activeProvider = useAppSelector(selectActiveProvider)
  const providers = useAppSelector(selectProviders)
  const fontSize = useAppSelector(selectFontSize)
  const readingWidth = useAppSelector(selectReadingWidth)
  const quizLength = useAppSelector(selectQuizLength)
  const defaultChapterCount = useAppSelector(selectDefaultChapterCount)
  const textureEnabled = useAppSelector(selectTextureEnabled)
  const textureOpacity = useAppSelector(selectTextureOpacity)
  const modelAssignmentSeen = useAppSelector(selectModelAssignmentSeen)

  const [profileOpen, setProfileOpen] = useState(false)
  const [interviewOpen, setInterviewOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [modelAssignOpen, setModelAssignOpen] = useState(false)
  const [audiobookSettingsOpen, setAudiobookSettingsOpen] = useState(false)
  const [internalDialogOpen, setInternalDialogOpen] = useState(false)
  const [dialogProvider, setDialogProvider] = useState<ProviderId>(activeProvider)
  const [keyInputs, setKeyInputs] = useState<Partial<Record<ProviderId, string>>>({})
  const { configured: profileConfigured, refresh: refreshProfile } = useLearningProfile()
  const apiKeyInputRef = useRef<HTMLInputElement>(null)

  // Check if learning profile has been set up
  useEffect(() => {
    refreshProfile()
  }, [refreshProfile])

  // Re-check after interview or profile dialog closes
  useEffect(() => {
    if (!profileOpen && !interviewOpen) refreshProfile()
  }, [profileOpen, interviewOpen, refreshProfile])

  const needsApiKey = !hasApiKey
  const needsProfile = profileConfigured === false
  const hasAnyBadge = needsApiKey || needsProfile

  const dialogOpen = internalDialogOpen || (apiKeyDialogOpen ?? false)
  const setDialogOpen = (open: boolean) => {
    setInternalDialogOpen(open)
    if (!open) onApiKeyDialogClose?.()
  }

  useEffect(() => {
    if (apiKeyDialogOpen) {
      setDialogProvider(activeProvider)
      setKeyInputs({})
    }
  }, [apiKeyDialogOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setDialogProvider(activeProvider)
    setKeyInputs({})
    setDialogOpen(true)
  }

  const handleSelectDialogProvider = (id: ProviderId) => {
    setDialogProvider(id)
  }

  useEffect(() => {
    if (!dialogOpen) return
    const t = setTimeout(() => apiKeyInputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [dialogOpen, dialogProvider])

  const saveTimeoutsRef = useRef<Partial<Record<ProviderId, ReturnType<typeof setTimeout>>>>({})

  const persistProviderKey = async (provider: ProviderId, key: string) => {
    const trimmed = key.trim()
    if (!trimmed) return
    await window.electronAPI?.saveApiKey(trimmed, provider)
    try {
      await saveApiKey(provider, trimmed)
    } catch { /* server may not be ready */ }
    dispatch(setProviderApiKey({ provider, apiKey: trimmed }))
  }

  const handleKeyInputChange = (provider: ProviderId, value: string) => {
    setKeyInputs(prev => ({ ...prev, [provider]: value }))
    const existing = saveTimeoutsRef.current[provider]
    if (existing) clearTimeout(existing)
    saveTimeoutsRef.current[provider] = setTimeout(() => {
      persistProviderKey(provider, value)
    }, API_KEY_DEBOUNCE_MS)
  }

  const handleRemove = async (provider: ProviderId) => {
    await window.electronAPI?.removeApiKey(provider)
    try {
      await removeApiKey(provider)
    } catch { /* server may not be ready */ }
    dispatch(setProviderApiKey({ provider, apiKey: null }))
    setKeyInputs(prev => {
      const next = { ...prev }
      delete next[provider]
      return next
    })
  }

  const activeDef = PROVIDERS[activeProvider]
  const activeModel = providers[activeProvider]?.model
  const activeModelLabel = activeDef.models.find(m => m.value === activeModel)?.label ?? activeModel

  const chapterCountIndex = CHAPTER_COUNTS.indexOf(defaultChapterCount)
  const defaultChapterIndex = CHAPTER_COUNTS.indexOf(DEFAULT_CHAPTER_COUNT)
  const chapterCountLabel = CHAPTER_LABELS[chapterCountIndex >= 0 ? chapterCountIndex : defaultChapterIndex]

  const fontSizeIndex = FONT_SIZES.indexOf(fontSize)
  const defaultIndex = FONT_SIZES.indexOf(DEFAULT_FONT_SIZE)
  const readingWidthIndex = (READING_WIDTHS as readonly number[]).indexOf(readingWidth)
  const defaultWidthIndex = READING_WIDTHS.indexOf(DEFAULT_READING_WIDTH)
  const readingWidthLabel = READING_WIDTH_LABELS[readingWidthIndex >= 0 ? readingWidthIndex : defaultWidthIndex]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Settings"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className={`relative ${subtle ? 'text-content-faint hover:text-content-muted' : ''}`}
            />
          }
        >
          <Settings className="size-4" />
          {hasAnyBadge && !subtle && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-status-warn" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[280px]">
          {/* Provider / API Key */}
          <DropdownMenuItem onClick={openDialog} className="whitespace-nowrap">
            <span className="size-4 flex items-center justify-center text-[10px] font-bold text-content-muted transition-colors group-focus/dropdown-menu-item:text-accent-foreground">
              {activeDef.label.slice(0, 2).toUpperCase()}
            </span>
            {hasApiKey ? (
              <>
                {activeDef.name}
                <span className="ml-auto text-xs text-content-muted transition-colors group-focus/dropdown-menu-item:text-accent-foreground">{activeModelLabel}</span>
              </>
            ) : (
              <>
                AI Provider
                <span className="ml-auto flex items-center gap-1.5 text-xs text-status-warn">
                  Not set
                  <span className="size-1.5 rounded-full bg-status-warn" />
                </span>
              </>
            )}
          </DropdownMenuItem>

          {hasApiKey && (
            <>
              <DropdownMenuItem onClick={() => { dispatch(setModelAssignmentSeen(true)); setModelAssignOpen(true) }}>
                <Sliders className="size-4" />
                Model Assignment
                {!modelAssignmentSeen && (
                  <span className="ml-auto rounded-full bg-[oklch(0.55_0.20_285)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                    New
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <User className="size-4" />
            Learning Profile
            {needsProfile && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-status-warn">
                Not set
                <span className="size-1.5 rounded-full bg-status-warn" />
              </span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onReviewProgress?.()}>
            <BarChart3 className="size-4" />
            Review Progress
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setAudiobookSettingsOpen(true)}>
            <Headphones className="size-4" />
            Audiobook narration
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Quiz Length */}
          <SettingsSlider
            icon={<ListOrdered className="size-3.5" />}
            label="Quiz Length"
            valueLabel={quizLength}
            min={1}
            max={10}
            value={quizLength}
            onChange={v => dispatch(setQuizLength(v))}
            ticks={Array.from({ length: 10 }, (_, i) => ({
              highlight: i + 1 === 3,
              label: i + 1 === 3 ? 'default' : undefined,
            }))}
          />

          <DropdownMenuSeparator />

          {/* Default Chapter Count */}
          <SettingsSlider
            icon={<BookOpen className="size-3.5" />}
            label="Default Book Length"
            valueLabel={<>{defaultChapterCount} &middot; {chapterCountLabel}</>}
            min={0}
            max={CHAPTER_COUNTS.length - 1}
            value={chapterCountIndex >= 0 ? chapterCountIndex : defaultChapterIndex}
            onChange={v => dispatch(setDefaultChapterCount(CHAPTER_COUNTS[v]))}
            ticks={CHAPTER_COUNTS.map((_, i) => ({
              highlight: i === defaultChapterIndex,
              label: i === defaultChapterIndex ? 'default' : undefined,
            }))}
          />

          <DropdownMenuSeparator />

          {/* Theme */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={v => setTheme(v as 'light' | 'dark' | 'system')}>
              <DropdownMenuRadioItem value="light">
                <Sun className="size-4" />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="size-4" />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="size-4" />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Font Size */}
          <SettingsSlider
            icon={<Type className="size-3.5" />}
            label="Font Size"
            valueLabel={`${fontSize}px`}
            min={0}
            max={FONT_SIZES.length - 1}
            value={fontSizeIndex >= 0 ? fontSizeIndex : defaultIndex}
            onChange={v => dispatch(setFontSize(FONT_SIZES[v]))}
            ticks={FONT_SIZES.map((_, i) => ({
              highlight: i === defaultIndex,
              label: i === defaultIndex ? 'default' : undefined,
            }))}
          />

          <DropdownMenuSeparator />

          {/* Reading Width */}
          <SettingsSlider
            icon={<MoveHorizontal className="size-3.5" />}
            label="Reading Width"
            valueLabel={readingWidthLabel}
            min={0}
            max={READING_WIDTHS.length - 1}
            value={readingWidthIndex >= 0 ? readingWidthIndex : defaultWidthIndex}
            onChange={v => dispatch(setReadingWidth(READING_WIDTHS[v]))}
            ticks={READING_WIDTHS.map((_, i) => ({
              highlight: i === defaultWidthIndex,
              label: i === defaultWidthIndex ? 'default' : undefined,
            }))}
          />

          <DropdownMenuSeparator />

          {/* Texture */}
          <TextureControl
            enabled={textureEnabled}
            opacity={textureOpacity}
            onToggle={() => dispatch(setTextureEnabled(!textureEnabled))}
            onOpacityChange={v => dispatch(setTextureOpacity(v))}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Provider settings dialog */}
      <ApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        providers={providers}
        activeProvider={activeProvider}
        onActiveProviderChange={id => dispatch(setActiveProvider(id))}
        dialogProvider={dialogProvider}
        onSelectDialogProvider={handleSelectDialogProvider}
        keyInputs={keyInputs}
        onKeyInputChange={handleKeyInputChange}
        onRemove={handleRemove}
        apiKeyInputRef={apiKeyInputRef}
      />

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onStartInterview={() => {
          setProfileOpen(false)
          setInterviewOpen(true)
        }}
        onOpenSkills={() => {
          setProfileOpen(false)
          setSkillsOpen(true)
        }}
      />

      <InterviewPanel
        open={interviewOpen}
        onClose={(profileUpdated) => {
          setInterviewOpen(false)
          if (profileUpdated) {
            setProfileOpen(true)
          }
        }}
        onMissingApiKey={openDialog}
      />

      <SkillsPanel
        open={skillsOpen}
        onClose={() => {
          setSkillsOpen(false)
          setProfileOpen(true)
        }}
      />

      <ModelAssignmentDialog open={modelAssignOpen} onOpenChange={setModelAssignOpen} />

      <AudiobookSettingsDialog open={audiobookSettingsOpen} onOpenChange={setAudiobookSettingsOpen} />
    </>
  )
}
