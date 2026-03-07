import { useState } from 'react'
import { Settings, Sun, Moon, Monitor, Key } from 'lucide-react'
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuGroup,
} from '@src/components/ui/dropdown-menu'
import { useTheme } from '@src/components/ThemeProvider'
import { useAppDispatch, useAppSelector, selectApiKey, selectModel, setApiKey, setModel } from '@src/store'

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus' },
]

export function SettingsMenu() {
  const { theme, setTheme } = useTheme()
  const dispatch = useAppDispatch()
  const apiKey = useAppSelector(selectApiKey)
  const model = useAppSelector(selectModel)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [selectedModel, setSelectedModel] = useState(model)

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

        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[160px]">
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Appearance</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
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
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
