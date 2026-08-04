import * as React from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { ToolCallStatus } from '@renderer/lib/agent/types'

export type CompactBadgeTone = 'default' | 'blue' | 'amber' | 'green' | 'red'

export interface CompactToolHeaderBadge {
  label: string
  tone?: CompactBadgeTone
}

export interface CompactToolHeaderModel {
  icon: React.ReactNode
  primary: string
  secondary?: string
  badges: CompactToolHeaderBadge[]
  statusBadge?: React.ReactNode
  title: string
  toolLabel?: string
  namespace?: string
}

interface CompactToolCallHeaderProps {
  model: CompactToolHeaderModel
  status: ToolCallStatus | 'completed'
  statusLabel: string | null
  hasError: boolean
  errorTitle?: string | null
  elapsed: string | null
  open: boolean
}

function compactBadgeClassName(tone: CompactBadgeTone = 'default'): string {
  switch (tone) {
    case 'blue':
      return 'border-sky-500/20 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300'
    case 'amber':
      return 'border-amber-500/20 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300'
    case 'green':
      return 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300'
    case 'red':
      return 'border-destructive/25 bg-destructive/[0.08] text-destructive'
    default:
      return 'border-border/55 bg-background/70 text-muted-foreground dark:bg-white/[0.035]'
  }
}

function compactStatusBadgeClassName(status: ToolCallStatus | 'completed'): string {
  if (status === 'error') return compactBadgeClassName('red')
  if (status === 'canceled') return compactBadgeClassName('default')
  if (status === 'pending_approval') return compactBadgeClassName('amber')
  if (status === 'running') return compactBadgeClassName('blue')
  if (status === 'streaming') return compactBadgeClassName('default')
  return compactBadgeClassName('green')
}

function compactHeaderStateClassName(
  status: ToolCallStatus | 'completed',
  open: boolean,
  isShellTool: boolean
): string {
  const showOpenBackground = open && !isShellTool
  if (status === 'error') {
    return cn(
      'text-destructive/85 hover:bg-destructive/[0.035]',
      showOpenBackground && 'bg-destructive/[0.025]'
    )
  }
  if (status === 'running') {
    return cn('text-sky-600 dark:text-sky-300', showOpenBackground && 'bg-sky-500/[0.025]')
  }
  if (status === 'streaming') {
    return isShellTool
      ? cn('text-sky-600 dark:text-sky-300', showOpenBackground && 'bg-sky-500/[0.025]')
      : cn('text-violet-600 dark:text-violet-300', showOpenBackground && 'bg-violet-500/[0.025]')
  }
  if (status === 'pending_approval') {
    return cn('text-amber-600 dark:text-amber-300', showOpenBackground && 'bg-amber-500/[0.035]')
  }
  return cn('text-muted-foreground', showOpenBackground && 'bg-muted/25 dark:bg-white/[0.025]')
}

// DEEIX-style timeline node: terminal states collapse to a small dot (failure is
// a red dot, not a red bar); only in-flight states keep a spinner for liveness.
function timelineDotClassName(status: ToolCallStatus | 'completed'): string {
  if (status === 'error') return 'bg-destructive/80'
  if (status === 'canceled') return 'bg-muted-foreground/50'
  if (status === 'pending_approval') return 'bg-amber-500/80'
  return 'bg-muted-foreground/38 group-hover:bg-foreground/58'
}

export function CompactToolCallHeader({
  model,
  status,
  statusLabel,
  hasError,
  errorTitle,
  elapsed,
  open
}: CompactToolCallHeaderProps): React.JSX.Element {
  const isShellTool = model.namespace === 'shell'
  const showSpinner = status === 'running' || status === 'streaming'
  const toolLabel = model.toolLabel ?? model.primary
  const primaryDetail = model.toolLabel && model.primary !== model.toolLabel ? model.primary : ''
  const detailText = [primaryDetail, model.secondary].filter(Boolean).join(' · ')
  const shouldPulseToolName = status === 'running' || status === 'streaming'
  const isActiveStatus = status === 'running' || status === 'streaming'

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition-colors duration-200 hover:bg-muted/35 hover:text-foreground dark:hover:bg-white/[0.035]',
        compactHeaderStateClassName(status, open, isShellTool),
        'group-hover:text-foreground'
      )}
      title={model.title}
    >
      <span
        className="relative flex h-5 w-3.5 shrink-0 items-center justify-center"
        aria-hidden="true"
        title={hasError ? (errorTitle ?? undefined) : undefined}
      >
        <span className="absolute -inset-y-1.5 left-1/2 w-px -translate-x-1/2 bg-border/45" />
        {showSpinner ? (
          <Loader2 className="relative z-10 size-3 animate-spin" />
        ) : (
          <span
            className={cn(
              'relative z-10 size-1.5 rounded-full ring-4 ring-background transition-colors',
              timelineDotClassName(status)
            )}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {model.namespace ? (
          <>
            <span className="shrink-0 text-[12px] text-muted-foreground/55">{model.namespace}</span>
            <span className="shrink-0 text-muted-foreground/40">&gt;</span>
          </>
        ) : null}
        <span
          className={cn(
            'shrink-0 font-mono text-[12px] font-medium',
            shouldPulseToolName
              ? [
                  'tool-name-live-pulse',
                  status === 'running'
                    ? `tool-name-live-pulse--${isShellTool ? 'shell' : 'running'}`
                    : `tool-name-live-pulse--${isShellTool ? 'shell' : 'streaming'}`
                ]
              : 'text-current transition-colors'
          )}
        >
          {toolLabel}
        </span>
        {detailText ? (
          <span className="min-w-0 truncate text-[12px] text-muted-foreground/55">
            ({detailText})
          </span>
        ) : null}
      </span>
      {/* Terminal states are conveyed by the timeline dot alone (DEEIX style); a
          text pill only remains for states the user may need to act on or watch. */}
      {statusLabel && (isActiveStatus || status === 'pending_approval') ? (
        <span
          className={cn(
            isActiveStatus
              ? 'hidden shrink-0 text-[10px] font-semibold sm:inline-flex'
              : 'hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium sm:inline-flex',
            !isActiveStatus && compactStatusBadgeClassName(status),
            isActiveStatus && 'tool-name-live-pulse',
            status === 'running' && `tool-name-live-pulse--${isShellTool ? 'shell' : 'running'}`,
            status === 'streaming' && `tool-name-live-pulse--${isShellTool ? 'shell' : 'streaming'}`
          )}
        >
          {statusLabel}
        </span>
      ) : null}
      {model.statusBadge}
      {model.badges.slice(0, 2).map((badge) => (
        <span
          key={badge.label}
          className={cn(
            'hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium md:inline-flex',
            compactBadgeClassName(badge.tone)
          )}
        >
          {badge.label}
        </span>
      ))}
      {elapsed ? (
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/60">{elapsed}</span>
      ) : null}
      {open ? (
        <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
      ) : (
        <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
      )}
    </div>
  )
}
