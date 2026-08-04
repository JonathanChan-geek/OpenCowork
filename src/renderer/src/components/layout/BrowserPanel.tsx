import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Square,
  Globe,
  AlertCircle,
  Disc,
  Trash2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { useUIStore } from '@renderer/stores/ui-store'
import { useSettingsStore } from '@renderer/stores/settings-store'
import {
  getBrowserAccessDecision,
  normalizeBrowserUrl
} from '@renderer/lib/app-plugin/browser-access'
import { ipcClient } from '@renderer/lib/ipc/ipc-client'
import { IPC } from '@renderer/lib/ipc/channels'
import {
  describeWebviewOperationError,
  isPromiseLike,
  isWebviewConnected,
  type MaybePromise
} from '@renderer/lib/browser/webview-helpers'
import { useTranslation } from 'react-i18next'
import {
  BUILTIN_BROWSER_PARTITION,
  stripElectronFromUserAgent
} from '../../../../shared/browser-plugin'
import { FEATURES } from '../../../../shared/feature-config'
import { toast } from 'sonner'
import {
  MAX_RECORDED_STEPS,
  parseRecorderEventPayload,
  useRecordingSession
} from '@renderer/lib/recorder/recording-session'
import { RECORDER_CONSOLE_PREFIX, RECORDER_SCRIPT } from '@renderer/lib/recorder/recorder-script'
import { RECIPE_FORMAT_VERSION, type RecordedRecipe } from '@renderer/lib/recorder/recipe-types'
import { renderRecipeSkill } from '@renderer/lib/recorder/recipe-to-skill'

type MutationResult = { success?: boolean; error?: string }

function toKebabCase(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return normalized || fallback
}

function joinHomePath(home: string, ...segments: string[]): string {
  const separator = home.includes('\\') ? '\\' : '/'
  return [home.replace(/[\\/]+$/, ''), ...segments].join(separator)
}

async function installRecordedSkill(name: string, content: string): Promise<void> {
  const home = (await ipcClient.invoke(IPC.APP_HOMEDIR)) as unknown
  if (typeof home !== 'string' || !home.trim()) throw new Error('Unable to resolve the user home')

  const stagingRoot = joinHomePath(home, '.open-cowork', 'recorder-staging', crypto.randomUUID())
  const sourcePath = joinHomePath(stagingRoot, name)
  let stagingCreated = false

  try {
    const mkdirResult = (await ipcClient.invoke(IPC.FS_MKDIR, {
      path: sourcePath
    })) as MutationResult
    if (!mkdirResult.success) throw new Error(mkdirResult.error || 'Unable to stage the skill')
    stagingCreated = true

    const writeResult = (await ipcClient.invoke(IPC.FS_WRITE_FILE, {
      path: joinHomePath(sourcePath, 'SKILL.md'),
      content
    })) as MutationResult
    if (!writeResult.success) throw new Error(writeResult.error || 'Unable to write SKILL.md')

    const installResult = (await ipcClient.invoke(IPC.SKILLS_ADD_FROM_FOLDER, {
      sourcePath
    })) as MutationResult
    if (!installResult.success)
      throw new Error(installResult.error || 'Unable to install the skill')
  } finally {
    if (stagingCreated) {
      try {
        const cleanupResult = (await ipcClient.invoke(IPC.FS_DELETE, {
          path: stagingRoot
        })) as MutationResult
        if (!cleanupResult.success) {
          console.warn('[BrowserRecorder] Failed to clean staging directory:', cleanupResult.error)
        }
      } catch (error) {
        console.warn('[BrowserRecorder] Failed to clean staging directory:', error)
      }
    }
  }
}

export function BrowserPanel({
  sessionId = null,
  projectId = null
}: {
  sessionId?: string | null
  projectId?: string | null
}): React.JSX.Element {
  const { t } = useTranslation('layout')

  const storedUrl = useUIStore((s) => s.getBrowserState(sessionId, projectId).url)
  const setBrowserUrl = useUIStore((s) => s.setBrowserUrl)
  const loading = useUIStore((s) => s.getBrowserState(sessionId, projectId).loading)
  const setBrowserLoading = useUIStore((s) => s.setBrowserLoading)
  const setBrowserPageTitle = useUIStore((s) => s.setBrowserPageTitle)
  const canGoBack = useUIStore((s) => s.getBrowserState(sessionId, projectId).canGoBack)
  const setBrowserCanGoBack = useUIStore((s) => s.setBrowserCanGoBack)
  const canGoForward = useUIStore((s) => s.getBrowserState(sessionId, projectId).canGoForward)
  const setBrowserCanGoForward = useUIStore((s) => s.setBrowserCanGoForward)
  const errorInfo = useUIStore((s) => s.getBrowserState(sessionId, projectId).errorInfo)
  const setBrowserErrorInfo = useUIStore((s) => s.setBrowserErrorInfo)
  const setBrowserWebviewRef = useUIStore((s) => s.setBrowserWebviewRef)
  const browserUserDataReuseEnabled = useSettingsStore((s) => s.browserUserDataReuseEnabled)
  const isRecording = useRecordingSession((s) => s.isRecording)
  const recordedSteps = useRecordingSession((s) => s.steps)
  const recordingStartUrl = useRecordingSession((s) => s.startUrl)
  const unsupportedStepCount = useRecordingSession((s) => s.unsupportedStepCount)
  const stoppedByLimit = useRecordingSession((s) => s.stoppedByLimit)
  const startRecording = useRecordingSession((s) => s.start)
  const stopRecording = useRecordingSession((s) => s.stop)
  const resetRecording = useRecordingSession((s) => s.reset)
  const removeRecordedStep = useRecordingSession((s) => s.removeStep)

  const [inputUrl, setInputUrl] = useState(storedUrl)
  const [committedUrl, setCommittedUrl] = useState(storedUrl)
  const [runtimeBrowserUserDataReuseEnabled, setRuntimeBrowserUserDataReuseEnabled] = useState(
    browserUserDataReuseEnabled
  )
  const [runtimeBrowserUserAgent, setRuntimeBrowserUserAgent] = useState<string | undefined>(
    browserUserDataReuseEnabled ? stripElectronFromUserAgent(navigator.userAgent) : undefined
  )
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [workflowTitle, setWorkflowTitle] = useState('')
  const [workflowDescription, setWorkflowDescription] = useState('')
  const [recordedAt, setRecordedAt] = useState('')
  const [fallbackSkillName, setFallbackSkillName] = useState('recorded-workflow')
  const [savingSkill, setSavingSkill] = useState(false)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const initialBrowserUserDataReuseEnabledRef = useRef(browserUserDataReuseEnabled)
  const webviewUserAgent = runtimeBrowserUserDataReuseEnabled ? runtimeBrowserUserAgent : undefined
  const skillName = useMemo(
    () => toKebabCase(workflowTitle, fallbackSkillName),
    [fallbackSkillName, workflowTitle]
  )
  const webviewSessionProps: Pick<
    React.ComponentProps<'webview'>,
    'partition' | 'allowpopups' | 'plugins' | 'useragent'
  > = {
    ...(runtimeBrowserUserDataReuseEnabled ? {} : { partition: BUILTIN_BROWSER_PARTITION }),
    allowpopups: true,
    plugins: runtimeBrowserUserDataReuseEnabled,
    ...(webviewUserAgent ? { useragent: webviewUserAgent } : {})
  }

  useEffect(() => {
    let cancelled = false

    async function loadRuntimeBrowserMode(): Promise<void> {
      try {
        const result = (await ipcClient.invoke(IPC.BROWSER_EMULATION_STATUS)) as
          | { success: true; status: { reuseEnabled: boolean; userAgent: string } }
          | { success: false; error?: string }
        if (!cancelled && result.success) {
          setRuntimeBrowserUserDataReuseEnabled(result.status.reuseEnabled)
          setRuntimeBrowserUserAgent(result.status.userAgent)
        }
      } catch {
        if (!cancelled) {
          setRuntimeBrowserUserDataReuseEnabled(initialBrowserUserDataReuseEnabledRef.current)
          setRuntimeBrowserUserAgent(stripElectronFromUserAgent(navigator.userAgent))
        }
      }
    }

    void loadRuntimeBrowserMode()
    return () => {
      cancelled = true
    }
  }, [])

  const handleWebviewOperationError = useCallback(
    (action: string, error: unknown): void => {
      console.warn('[BrowserPanel] Webview operation failed:', {
        action,
        message: describeWebviewOperationError(action, error)
      })
      setBrowserLoading(false, sessionId, projectId)
      setBrowserCanGoBack(false, sessionId, projectId)
      setBrowserCanGoForward(false, sessionId, projectId)
    },
    [projectId, sessionId, setBrowserCanGoBack, setBrowserCanGoForward, setBrowserLoading]
  )

  const runWebviewCommand = useCallback(
    (action: string, command: (webview: Electron.WebviewTag) => MaybePromise<void>): void => {
      const wv = webviewRef.current
      if (!isWebviewConnected(wv)) return

      try {
        const result = command(wv)
        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch((error) => handleWebviewOperationError(action, error))
        }
      } catch (error) {
        handleWebviewOperationError(action, error)
      }
    },
    [handleWebviewOperationError]
  )

  const activateRecorder = useCallback((): void => {
    if (!useRecordingSession.getState().isRecording) return
    runWebviewCommand('install workflow recorder', (wv) =>
      wv.executeJavaScript(RECORDER_SCRIPT).then(() => undefined)
    )
  }, [runWebviewCommand])

  const deactivateRecorder = useCallback((): void => {
    runWebviewCommand('pause workflow recorder', (wv) =>
      wv
        .executeJavaScript('window.__ocRecorderActive = false')
        .then(() => undefined)
        .catch(() => undefined)
    )
  }, [runWebviewCommand])

  const finishRecording = useCallback(
    (limitReached: boolean): void => {
      stopRecording()
      deactivateRecorder()
      const stoppedAt = new Date().toISOString()
      setRecordedAt(stoppedAt)
      setFallbackSkillName(`recorded-workflow-${Date.now().toString(36)}`)
      setWorkflowTitle('')
      setWorkflowDescription('')
      setSaveDialogOpen(true)
      if (limitReached) toast.warning(t('browser.recorder.stepLimitReached'))
    },
    [deactivateRecorder, stopRecording, t]
  )

  const handleRecordToggle = useCallback((): void => {
    if (isRecording) {
      finishRecording(false)
      return
    }

    let currentUrl = committedUrl
    const wv = webviewRef.current
    if (isWebviewConnected(wv)) {
      try {
        currentUrl = wv.getURL() || currentUrl
      } catch {
        // The committed URL is an adequate start anchor if the webview is between navigations.
      }
    }
    startRecording(currentUrl)
    activateRecorder()
  }, [activateRecorder, committedUrl, finishRecording, isRecording, startRecording])

  const closeSaveDialog = useCallback((): void => {
    if (savingSkill) return
    setSaveDialogOpen(false)
    resetRecording()
  }, [resetRecording, savingSkill])

  const handleSaveSkill = useCallback(async (): Promise<void> => {
    const title = workflowTitle.trim()
    const description = workflowDescription.trim()
    if (!title || !description || recordedSteps.length === 0) return

    const recipe: RecordedRecipe = {
      formatVersion: RECIPE_FORMAT_VERSION,
      name: skillName,
      title,
      description,
      startUrl: recordingStartUrl,
      steps: [...recordedSteps],
      recordedAt: recordedAt || new Date().toISOString()
    }

    setSavingSkill(true)
    try {
      await installRecordedSkill(skillName, renderRecipeSkill(recipe))
      toast.success(t('browser.recorder.saveSuccess'))
      setSaveDialogOpen(false)
      resetRecording()
    } catch (error) {
      toast.error(t('browser.recorder.saveFailed'), {
        description: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setSavingSkill(false)
    }
  }, [
    recordedAt,
    recordedSteps,
    recordingStartUrl,
    resetRecording,
    skillName,
    t,
    workflowDescription,
    workflowTitle
  ])

  useEffect(() => {
    setBrowserWebviewRef(webviewRef, sessionId, projectId)
    return () => {
      setBrowserWebviewRef(null, sessionId, projectId)
      setBrowserLoading(false, sessionId, projectId)
    }
  }, [projectId, sessionId, setBrowserLoading, setBrowserWebviewRef])

  useEffect(() => {
    setInputUrl(storedUrl)
    setCommittedUrl(storedUrl)
  }, [storedUrl])

  const blockNavigation = useCallback(
    (url: string, reason?: string): void => {
      setBrowserErrorInfo(
        {
          code: -10,
          desc: reason ?? t('browser.blockedByRules'),
          url
        },
        sessionId,
        projectId
      )
      setBrowserLoading(false, sessionId, projectId)
    },
    [projectId, sessionId, setBrowserErrorInfo, setBrowserLoading, t]
  )

  const canNavigateTo = useCallback(
    (url: string): boolean => {
      const decision = getBrowserAccessDecision(url)
      if (decision.allowed) return true
      blockNavigation(url, decision.reason)
      return false
    },
    [blockNavigation]
  )

  const navigate = useCallback(
    (url: string): void => {
      const normalized = normalizeBrowserUrl(url)
      if (!normalized) return
      setInputUrl(normalized)
      if (!canNavigateTo(normalized)) return
      setCommittedUrl(normalized)
      setBrowserUrl(normalized, sessionId, projectId)
      setBrowserErrorInfo(null, sessionId, projectId)
      const wv = webviewRef.current
      if (isWebviewConnected(wv)) {
        try {
          wv.src = normalized
        } catch (error) {
          handleWebviewOperationError('navigate', error)
        }
      }
    },
    [
      canNavigateTo,
      handleWebviewOperationError,
      projectId,
      sessionId,
      setBrowserErrorInfo,
      setBrowserUrl
    ]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') navigate(inputUrl)
  }

  const updateNavState = useCallback(() => {
    const wv = webviewRef.current
    if (!isWebviewConnected(wv)) return

    try {
      setBrowserCanGoBack(wv.canGoBack(), sessionId, projectId)
      setBrowserCanGoForward(wv.canGoForward(), sessionId, projectId)
    } catch (error) {
      handleWebviewOperationError('read navigation state', error)
    }
  }, [
    handleWebviewOperationError,
    projectId,
    sessionId,
    setBrowserCanGoBack,
    setBrowserCanGoForward
  ])

  useEffect(() => {
    const wv = webviewRef.current
    if (!isWebviewConnected(wv)) return

    const onStartLoading = (): void => {
      setBrowserLoading(true, sessionId, projectId)
      setBrowserErrorInfo(null, sessionId, projectId)
    }

    const onStopLoading = (): void => {
      setBrowserLoading(false, sessionId, projectId)
      updateNavState()
    }

    const onNavigate = (e: Electron.DidNavigateEvent): void => {
      setInputUrl(e.url)
      setBrowserUrl(e.url, sessionId, projectId)
      updateNavState()
      const result = useRecordingSession.getState().recordNavigation(e.url)
      if (result.autoStopped) finishRecording(true)
      activateRecorder()
    }

    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent): void => {
      setInputUrl(e.url)
      setBrowserUrl(e.url, sessionId, projectId)
      updateNavState()
    }

    const onTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      setBrowserPageTitle(e.title, sessionId, projectId)
    }

    const onFailLoad = (e: Electron.DidFailLoadEvent): void => {
      if (!e.isMainFrame || e.errorCode === -3) return
      setBrowserErrorInfo(
        { code: e.errorCode, desc: e.errorDescription, url: e.validatedURL },
        sessionId,
        projectId
      )
      setBrowserLoading(false, sessionId, projectId)
    }

    const onWillNavigate = (e: Event & { url?: string; preventDefault: () => void }): void => {
      if (!e.url || canNavigateTo(e.url)) return
      e.preventDefault()
    }

    const onNewWindow = (e: Event & { url: string; preventDefault: () => void }): void => {
      e.preventDefault()
      if (!canNavigateTo(e.url)) return
      ipcClient.invoke(IPC.SHELL_OPEN_EXTERNAL, e.url)
    }

    const onDomReady = (): void => {
      activateRecorder()
    }

    const onConsoleMessage = (e: Event & { message?: string }): void => {
      const message = e.message
      if (typeof message !== 'string' || !message.startsWith(RECORDER_CONSOLE_PREFIX)) return

      let rawPayload: unknown
      try {
        rawPayload = JSON.parse(message.slice(RECORDER_CONSOLE_PREFIX.length))
      } catch {
        return
      }

      const payload = parseRecorderEventPayload(rawPayload)
      if (!payload) return
      const result = useRecordingSession.getState().recordEvent(payload)
      if (result.autoStopped) finishRecording(true)
    }

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-navigate', onNavigate as EventListener)
    wv.addEventListener('did-navigate-in-page', onNavigateInPage as EventListener)
    wv.addEventListener('page-title-updated', onTitleUpdated as EventListener)
    wv.addEventListener('did-fail-load', onFailLoad as EventListener)
    wv.addEventListener('will-navigate', onWillNavigate as EventListener)
    wv.addEventListener('new-window', onNewWindow as EventListener)
    wv.addEventListener('dom-ready', onDomReady)
    wv.addEventListener('console-message', onConsoleMessage as EventListener)

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-navigate', onNavigate as EventListener)
      wv.removeEventListener('did-navigate-in-page', onNavigateInPage as EventListener)
      wv.removeEventListener('page-title-updated', onTitleUpdated as EventListener)
      wv.removeEventListener('did-fail-load', onFailLoad as EventListener)
      wv.removeEventListener('will-navigate', onWillNavigate as EventListener)
      wv.removeEventListener('new-window', onNewWindow as EventListener)
      wv.removeEventListener('dom-ready', onDomReady)
      wv.removeEventListener('console-message', onConsoleMessage as EventListener)
    }
  }, [
    activateRecorder,
    canNavigateTo,
    committedUrl,
    finishRecording,
    projectId,
    runtimeBrowserUserDataReuseEnabled,
    sessionId,
    setBrowserLoading,
    setBrowserErrorInfo,
    setBrowserUrl,
    setBrowserPageTitle,
    updateNavState
  ])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/50 px-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => runWebviewCommand('go back', (wv) => wv.goBack())}
          disabled={!canGoBack}
          title={t('browser.back')}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => runWebviewCommand('go forward', (wv) => wv.goForward())}
          disabled={!canGoForward}
          title={t('browser.forward')}
        >
          <ArrowRight className="size-3.5" />
        </Button>
        {loading ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => runWebviewCommand('stop loading', (wv) => wv.stop())}
            title={t('browser.stop')}
          >
            <Square className="size-3" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => runWebviewCommand('refresh', (wv) => wv.reload())}
            title={t('browser.refresh')}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        )}

        <div className="flex flex-1 items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 h-6">
          <Globe className="size-3 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('browser.urlPlaceholder')}
            spellCheck={false}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => navigate(inputUrl)}
        >
          {t('browser.go')}
        </Button>

        {FEATURES.workflowRecorder && (
          <Button
            variant="ghost"
            size="icon"
            className={`size-6 ${
              isRecording
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/15 hover:text-red-500 dark:text-red-400'
                : 'text-muted-foreground'
            }`}
            onClick={handleRecordToggle}
            disabled={!committedUrl && !isRecording}
            aria-pressed={isRecording}
            aria-label={
              isRecording
                ? t('browser.recorder.stopRecording')
                : t('browser.recorder.startRecording')
            }
            title={
              isRecording
                ? t('browser.recorder.recordingCount', {
                    count: recordedSteps.length,
                    limit: MAX_RECORDED_STEPS
                  })
                : t('browser.recorder.startRecording')
            }
          >
            {isRecording ? (
              <Square className="size-3 animate-pulse fill-current" />
            ) : (
              <Disc className="size-3.5" />
            )}
          </Button>
        )}
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="h-0.5 w-full overflow-hidden bg-muted">
          <div className="h-full w-full animate-progress bg-primary/60" />
        </div>
      )}

      {/* Content */}
      <div className="relative min-h-0 flex-1">
        {committedUrl && (
          <webview
            key={runtimeBrowserUserDataReuseEnabled ? 'user-browser-profile' : 'opencowork-profile'}
            ref={webviewRef as React.Ref<Electron.WebviewTag>}
            src={committedUrl}
            className="size-full"
            {...webviewSessionProps}
          />
        )}
        {errorInfo ? (
          <>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
              <AlertCircle className="size-10 opacity-30" />
              <p className="font-medium">{t('rightPanel.browserLoadFailed')}</p>
              <p className="text-xs opacity-70">
                {errorInfo.desc} ({errorInfo.code})
              </p>
              <p className="max-w-[80%] truncate text-xs opacity-50">{errorInfo.url}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBrowserErrorInfo(null, sessionId, projectId)
                  runWebviewCommand('retry load', (wv) => wv.reload())
                }}
              >
                {t('rightPanel.browserRetry')}
              </Button>
            </div>
          </>
        ) : !committedUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <Globe className="size-8 opacity-20" />
            <span>{t('rightPanel.browserEmptyState')}</span>
          </div>
        ) : null}
      </div>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeSaveDialog()
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b bg-muted/20 px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-7 items-center justify-center rounded-full bg-red-500/10 text-red-500 dark:text-red-400">
                <Disc className="size-3.5" />
              </span>
              {t('browser.recorder.saveTitle')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t('browser.recorder.saveDescription', { count: recordedSteps.length })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {stoppedByLimit && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {t('browser.recorder.limitNotice', { limit: MAX_RECORDED_STEPS })}
              </div>
            )}

            {unsupportedStepCount > 0 && (
              <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                {t('browser.recorder.unsupportedNotice', { count: unsupportedStepCount })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="recorded-workflow-title" className="text-xs font-medium">
                  {t('browser.recorder.titleLabel')}
                </label>
                <Input
                  id="recorded-workflow-title"
                  value={workflowTitle}
                  onChange={(event) => setWorkflowTitle(event.target.value)}
                  placeholder={t('browser.recorder.titlePlaceholder')}
                  maxLength={80}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium">{t('browser.recorder.skillNameLabel')}</span>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 font-mono text-xs text-muted-foreground">
                  <span className="truncate">{skillName}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="recorded-workflow-description" className="text-xs font-medium">
                {t('browser.recorder.descriptionLabel')}
              </label>
              <Textarea
                id="recorded-workflow-description"
                value={workflowDescription}
                onChange={(event) => setWorkflowDescription(event.target.value)}
                placeholder={t('browser.recorder.descriptionPlaceholder')}
                maxLength={200}
                className="min-h-20 resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t('browser.recorder.stepsLabel')}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {recordedSteps.length}/{MAX_RECORDED_STEPS}
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-md border border-border/70 bg-muted/15">
                {recordedSteps.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {t('browser.recorder.noSteps')}
                  </div>
                ) : (
                  <ol className="divide-y divide-border/60">
                    {recordedSteps.map((step, index) => (
                      <li
                        key={`${step.tool}-${step.pageUrl}-${index}`}
                        className="group flex items-start gap-2.5 px-3 py-2.5"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/8 font-mono text-[10px] text-primary">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {step.tool}
                          </div>
                          <div className="truncate text-xs text-foreground/90">
                            {step.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground opacity-70 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => removeRecordedStep(index)}
                          disabled={savingSkill}
                          aria-label={t('browser.recorder.deleteStep', { index: index + 1 })}
                          title={t('browser.recorder.deleteStep', { index: index + 1 })}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-5 py-3">
            <Button variant="outline" onClick={closeSaveDialog} disabled={savingSkill}>
              {t('browser.recorder.cancel')}
            </Button>
            <Button
              onClick={() => void handleSaveSkill()}
              disabled={
                savingSkill ||
                !workflowTitle.trim() ||
                !workflowDescription.trim() ||
                recordedSteps.length === 0
              }
            >
              {savingSkill ? t('browser.recorder.saving') : t('browser.recorder.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
