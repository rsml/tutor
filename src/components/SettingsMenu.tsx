import { useEffect, useState } from 'react'
import { Settings, Sun, Moon, Monitor, Type, Layers, Check, User } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@src/components/ui/dialog'
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
} from '@src/components/ui/dropdown-menu'
import { ProfileDialog } from '@src/components/ProfileDialog'
import { InterviewPanel } from '@src/components/InterviewPanel'
import { SkillsPanel } from '@src/components/SkillsPanel'
import { useTheme } from '@src/components/ThemeProvider'
import {
  useAppDispatch,
  useAppSelector,
  selectHasApiKey,
  selectActiveProvider,
  selectProviders,
  selectFontSize,
  selectTextureEnabled,
  selectTextureOpacity,
  setActiveProvider,
  setProviderApiKey,
  setProviderModel,
  setFontSize,
  setTextureEnabled,
  setTextureOpacity,
} from '@src/store'
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@src/lib/providers'
import { apiUrl } from '@src/lib/api-base'

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 20, 22]
const DEFAULT_FONT_SIZE = 16

interface SettingsMenuProps {
  apiKeyDialogOpen?: boolean
  onApiKeyDialogClose?: () => void
  subtle?: boolean
}

export function SettingsMenu({ apiKeyDialogOpen, onApiKeyDialogClose, subtle }: SettingsMenuProps = {}) {
  const { theme, setTheme } = useTheme()
  const dispatch = useAppDispatch()
  const hasApiKey = useAppSelector(selectHasApiKey)
  const activeProvider = useAppSelector(selectActiveProvider)
  const providers = useAppSelector(selectProviders)
  const fontSize = useAppSelector(selectFontSize)
  const textureEnabled = useAppSelector(selectTextureEnabled)
  const textureOpacity = useAppSelector(selectTextureOpacity)

  const [profileOpen, setProfileOpen] = useState(false)
  const [interviewOpen, setInterviewOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [internalDialogOpen, setInternalDialogOpen] = useState(false)
  const [dialogProvider, setDialogProvider] = useState<ProviderId>(activeProvider)
  const [keyInput, setKeyInput] = useState('')
  const [profileConfigured, setProfileConfigured] = useState<boolean | null>(null)

  // Check if learning profile has been set up
  useEffect(() => {
    fetch(apiUrl('/api/profile'))
      .then(res => res.json())
      .then(data => {
        setProfileConfigured(!!data.aboutMe?.trim())
      })
      .catch(() => setProfileConfigured(false))
  }, [])

  // Re-check after interview or profile dialog closes
  useEffect(() => {
    if (!profileOpen && !interviewOpen) {
      fetch(apiUrl('/api/profile'))
        .then(res => res.json())
        .then(data => setProfileConfigured(!!data.aboutMe?.trim()))
        .catch(() => {})
    }
  }, [profileOpen, interviewOpen])

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
      setKeyInput('')
    }
  }, [apiKeyDialogOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setDialogProvider(activeProvider)
    setKeyInput('')
    setDialogOpen(true)
  }

  const handleSelectDialogProvider = (id: ProviderId) => {
    setDialogProvider(id)
    setKeyInput('')
  }

  const handleSave = async () => {
    const trimmed = keyInput.trim()
    if (trimmed) {
      await window.electronAPI?.saveApiKey(trimmed, dialogProvider)
      try {
        await fetch(apiUrl('/api/settings/api-key'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: dialogProvider, apiKey: trimmed }),
        })
      } catch { /* server may not be ready */ }
    }
    dispatch(setProviderApiKey({ provider: dialogProvider, apiKey: trimmed || null }))
    dispatch(setActiveProvider(dialogProvider))
    setDialogOpen(false)
  }

  const handleRemove = async () => {
    await window.electronAPI?.removeApiKey(dialogProvider)
    try {
      await fetch(apiUrl('/api/settings/api-key'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: dialogProvider }),
      })
    } catch { /* server may not be ready */ }
    dispatch(setProviderApiKey({ provider: dialogProvider, apiKey: null }))
    setKeyInput('')
    setDialogOpen(false)
  }

  const activeDef = PROVIDERS[activeProvider]
  const activeModel = providers[activeProvider]?.model
  const activeModelLabel = activeDef.models.find(m => m.value === activeModel)?.label ?? activeModel

  const fontSizeIndex = FONT_SIZES.indexOf(fontSize)
  const defaultIndex = FONT_SIZES.indexOf(DEFAULT_FONT_SIZE)

  const dialogDef = PROVIDERS[dialogProvider]
  const dialogConfig = providers[dialogProvider]

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
              className={`relative ${subtle ? 'text-content-muted/40 hover:text-content-muted' : ''}`}
            />
          }
        >
          <Settings className="size-4" />
          {hasAnyBadge && !subtle && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-status-warn" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
          {/* Provider / API Key */}
          <DropdownMenuItem onClick={openDialog} className="whitespace-nowrap">
            <span className="size-4 flex items-center justify-center text-[10px] font-bold text-content-muted">
              {activeDef.label.slice(0, 2).toUpperCase()}
            </span>
            {hasApiKey ? (
              <>
                {activeDef.name}
                <span className="ml-auto text-xs text-content-muted">{activeModelLabel}</span>
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

          {/* Quick model switch for active provider */}
          {hasApiKey && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Model</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={activeModel}
                  onValueChange={v => dispatch(setProviderModel({ provider: activeProvider, model: v }))}
                >
                  {activeDef.models.map(m => (
                    <DropdownMenuRadioItem key={m.value} value={m.value}>
                      {m.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </>
          )}

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
          <div className="px-1.5 py-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
              <Type className="size-3.5" />
              Font Size
              <span className="ml-auto tabular-nums">{fontSize}px</span>
            </div>
            <div className="relative px-1">
              <input
                type="range"
                min={0}
                max={FONT_SIZES.length - 1}
                value={fontSizeIndex >= 0 ? fontSizeIndex : defaultIndex}
                onChange={e => dispatch(setFontSize(FONT_SIZES[parseInt(e.target.value)]))}
                className="w-full accent-[oklch(0.55_0.20_285)] cursor-pointer"
                onPointerDown={e => e.stopPropagation()}
              />
              {/* Tick marks — px-2 (8px) = half the native range thumb width so ticks align with thumb center */}
              <div className="flex justify-between px-2 -mt-0.5">
                {FONT_SIZES.map((size, i) => (
                  <div
                    key={size}
                    className={`relative flex flex-col items-center ${i === defaultIndex ? 'text-content-primary' : 'text-content-muted/40'}`}
                  >
                    <div className={`h-1.5 w-px ${i === defaultIndex ? 'bg-content-primary' : 'bg-content-muted/30'}`} />
                    {i === defaultIndex && (
                      <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap">default</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Texture */}
          <div className="px-1.5 py-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
              <Layers className="size-3.5" />
              Texture
              <button
                onClick={() => dispatch(setTextureEnabled(!textureEnabled))}
                onPointerDown={e => e.stopPropagation()}
                className={`ml-auto relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${
                  textureEnabled ? 'bg-[oklch(0.55_0.20_285)]' : 'bg-content-muted/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm transition-transform ${
                    textureEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  } translate-y-0.5`}
                />
              </button>
            </div>
            {textureEnabled && (
              <div className="px-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(textureOpacity * 100)}
                  onChange={e => dispatch(setTextureOpacity(parseInt(e.target.value) / 100))}
                  className="w-full accent-[oklch(0.55_0.20_285)] cursor-pointer"
                  onPointerDown={e => e.stopPropagation()}
                />
                <div className="flex justify-between text-[9px] text-content-muted/50 -mt-0.5 px-0.5">
                  <span>Subtle</span>
                  <span>Heavy</span>
                </div>
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Provider settings dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>AI Provider</DialogTitle>
            <DialogDescription>
              Select your AI provider and enter your API key.
            </DialogDescription>
          </DialogHeader>

          {/* Provider tabs */}
          <div className="flex gap-1.5">
            {PROVIDER_IDS.map(id => {
              const def = PROVIDERS[id]
              const hasKey = !!providers[id]?.apiKey
              const isSelected = dialogProvider === id
              const isActive = activeProvider === id && hasKey
              return (
                <button
                  key={id}
                  onClick={() => handleSelectDialogProvider(id)}
                  className={`relative flex-1 rounded-lg border px-3 py-2.5 text-center transition-colors ${
                    isSelected
                      ? 'border-border-focus bg-surface-muted text-content-primary'
                      : 'border-border-default text-content-muted hover:border-border-focus/50 hover:text-content-secondary'
                  }`}
                >
                  <div className="text-xs font-semibold">{def.name}</div>
                  <div className="text-[10px] text-content-muted mt-0.5">{def.label}</div>
                  {isActive && (
                    <Check className="absolute top-1 right-1 size-3 text-status-ok" />
                  )}
                  {hasKey && !isActive && (
                    <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-status-ok" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <label htmlFor="api-key" className="text-sm font-medium text-content-primary">
                API Key
              </label>
              <input
                id="api-key"
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={providers[dialogProvider]?.apiKey ? 'Key saved (enter new to replace)' : dialogDef.placeholder}
                className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 font-mono text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="model" className="text-sm font-medium text-content-primary">
                Model
              </label>
              <select
                id="model"
                value={dialogConfig?.model ?? dialogDef.defaultModel}
                onChange={e => dispatch(setProviderModel({ provider: dialogProvider, model: e.target.value }))}
                className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              >
                {dialogDef.models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            {dialogConfig?.apiKey && (
              <Button variant="destructive" onClick={handleRemove}>
                Remove Key
              </Button>
            )}
            <Button onClick={handleSave} disabled={!keyInput.trim()}>
              {dialogConfig?.apiKey ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
