import { useEffect, useState } from 'react'
import { Settings, Sun, Moon, Monitor, Key, Type, Layers } from 'lucide-react'
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
import { useTheme } from '@src/components/ThemeProvider'
import {
  useAppDispatch,
  useAppSelector,
  selectApiKey,
  selectModel,
  selectFontSize,
  selectTextureEnabled,
  selectTextureOpacity,
  setApiKey,
  setModel,
  setFontSize,
  setTextureEnabled,
  setTextureOpacity,
} from '@src/store'

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus' },
]

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 20, 22]
const DEFAULT_FONT_SIZE = 16

interface SettingsMenuProps {
  apiKeyDialogOpen?: boolean
  onApiKeyDialogClose?: () => void
}

export function SettingsMenu({ apiKeyDialogOpen, onApiKeyDialogClose }: SettingsMenuProps = {}) {
  const { theme, setTheme } = useTheme()
  const dispatch = useAppDispatch()
  const apiKey = useAppSelector(selectApiKey)
  const model = useAppSelector(selectModel)
  const fontSize = useAppSelector(selectFontSize)
  const textureEnabled = useAppSelector(selectTextureEnabled)
  const textureOpacity = useAppSelector(selectTextureOpacity)
  const [internalDialogOpen, setInternalDialogOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [selectedModel, setSelectedModel] = useState(model)

  const dialogOpen = internalDialogOpen || (apiKeyDialogOpen ?? false)
  const setDialogOpen = (open: boolean) => {
    setInternalDialogOpen(open)
    if (!open) onApiKeyDialogClose?.()
  }

  // Initialize inputs when dialog opens externally
  useEffect(() => {
    if (apiKeyDialogOpen) {
      setKeyInput(apiKey ?? '')
      setSelectedModel(model)
    }
  }, [apiKeyDialogOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setKeyInput(apiKey ?? '')
    setSelectedModel(model)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const trimmed = keyInput.trim()
    if (trimmed) {
      await window.electronAPI?.saveApiKey(trimmed)
    }
    dispatch(setApiKey(trimmed || null))
    dispatch(setModel(selectedModel))
    setDialogOpen(false)
  }

  const handleRemove = async () => {
    await window.electronAPI?.removeApiKey()
    dispatch(setApiKey(null))
    setKeyInput('')
    setDialogOpen(false)
  }

  const fontSizeIndex = FONT_SIZES.indexOf(fontSize)
  const defaultIndex = FONT_SIZES.indexOf(DEFAULT_FONT_SIZE)

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
              className="relative"
            />
          }
        >
          <Settings className="size-4" />
          {!apiKey && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-status-warn" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
          <DropdownMenuItem onClick={openDialog} className="whitespace-nowrap">
            <Key className="size-4" />
            API Key
            {apiKey ? (
              <span className="ml-auto text-xs text-content-muted">Set</span>
            ) : (
              <span className="ml-auto text-xs text-status-warn">Missing</span>
            )}
          </DropdownMenuItem>

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
              {/* Tick marks */}
              <div className="flex justify-between px-0.5 -mt-0.5">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>API Key</DialogTitle>
            <DialogDescription>
              Enter your Anthropic API key for AI-powered chat features. Your key is stored locally and never sent to our servers.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <label htmlFor="api-key" className="text-sm font-medium text-content-primary">
                API Key
              </label>
              <input
                id="api-key"
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 font-mono text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="model" className="text-sm font-medium text-content-primary">
                Model
              </label>
              <select
                id="model"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              >
                {MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            {apiKey && (
              <Button variant="destructive" onClick={handleRemove}>
                Remove
              </Button>
            )}
            <Button onClick={handleSave} disabled={!keyInput.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
