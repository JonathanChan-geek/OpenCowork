import { create } from 'zustand'
import type { RecordedStep } from './recipe-types'

export const MAX_RECORDED_STEPS = 40

export type RecorderEventPayload =
  | {
      kind: 'click'
      selector: string
      tag: string
      text: string
      pageUrl: string
    }
  | {
      kind: 'change'
      selector: string
      value: string
      tag?: string
      pageUrl: string
    }
  | {
      kind: 'unsupported'
      reason: 'contenteditable' | 'iframe'
      tag?: string
      pageUrl: string
    }

export interface RecordEventResult {
  accepted: boolean
  autoStopped: boolean
}

interface RecordingSessionState {
  isRecording: boolean
  startUrl: string
  steps: RecordedStep[]
  unsupportedStepCount: number
  stoppedByLimit: boolean
  start: (startUrl: string) => void
  stop: () => void
  reset: () => void
  recordEvent: (payload: RecorderEventPayload) => RecordEventResult
  recordNavigation: (url: string) => RecordEventResult
  removeStep: (index: number) => void
}

const REJECTED_EVENT: RecordEventResult = { accepted: false, autoStopped: false }

function truncate(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized
}

function stringArg(step: RecordedStep, key: string): string | undefined {
  const value = step.args[key]
  return typeof value === 'string' ? value : undefined
}

function appendStep(
  state: RecordingSessionState,
  step: RecordedStep
): Pick<RecordingSessionState, 'steps' | 'isRecording' | 'stoppedByLimit'> & RecordEventResult {
  if (state.steps.length >= MAX_RECORDED_STEPS) {
    return {
      steps: state.steps,
      isRecording: false,
      stoppedByLimit: true,
      accepted: false,
      autoStopped: true
    }
  }

  return {
    steps: [...state.steps, step],
    isRecording: true,
    stoppedByLimit: false,
    accepted: true,
    autoStopped: false
  }
}

function stepFromClick(payload: Extract<RecorderEventPayload, { kind: 'click' }>): RecordedStep {
  const text = truncate(payload.text, 80)
  const label = text ? `“${text}”` : `<${payload.tag}>`
  return {
    tool: 'BrowserClick',
    args: { selector: payload.selector },
    hint: text ? `${payload.tag} 元素，文本“${text}”` : `${payload.tag} 元素`,
    description: `点击 ${label}`,
    pageUrl: payload.pageUrl
  }
}

function stepFromChange(payload: Extract<RecorderEventPayload, { kind: 'change' }>): RecordedStep {
  const valueLabel =
    payload.value === '{{PASSWORD}}' ? '密码占位符' : `“${truncate(payload.value, 48)}”`
  return {
    tool: 'BrowserType',
    args: { selector: payload.selector, text: payload.value },
    hint: payload.tag ? `${payload.tag} 输入元素` : '输入元素',
    description: `在 ${payload.selector} 中输入 ${valueLabel}`,
    pageUrl: payload.pageUrl
  }
}

export function parseRecorderEventPayload(value: unknown): RecorderEventPayload | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  if (typeof payload.kind !== 'string' || typeof payload.pageUrl !== 'string') return null

  if (payload.kind === 'click') {
    if (
      typeof payload.selector !== 'string' ||
      typeof payload.tag !== 'string' ||
      typeof payload.text !== 'string'
    ) {
      return null
    }
    return {
      kind: 'click',
      selector: payload.selector,
      tag: payload.tag,
      text: payload.text,
      pageUrl: payload.pageUrl
    }
  }

  if (payload.kind === 'change') {
    if (typeof payload.selector !== 'string' || typeof payload.value !== 'string') return null
    return {
      kind: 'change',
      selector: payload.selector,
      value: payload.value,
      ...(typeof payload.tag === 'string' ? { tag: payload.tag } : {}),
      pageUrl: payload.pageUrl
    }
  }

  if (
    payload.kind === 'unsupported' &&
    (payload.reason === 'contenteditable' || payload.reason === 'iframe')
  ) {
    return {
      kind: 'unsupported',
      reason: payload.reason,
      ...(typeof payload.tag === 'string' ? { tag: payload.tag } : {}),
      pageUrl: payload.pageUrl
    }
  }

  return null
}

export const useRecordingSession = create<RecordingSessionState>((set, get) => ({
  isRecording: false,
  startUrl: '',
  steps: [],
  unsupportedStepCount: 0,
  stoppedByLimit: false,

  start: (startUrl) => {
    set({
      isRecording: true,
      startUrl,
      steps: [],
      unsupportedStepCount: 0,
      stoppedByLimit: false
    })
  },

  stop: () => set({ isRecording: false }),

  reset: () =>
    set({
      isRecording: false,
      startUrl: '',
      steps: [],
      unsupportedStepCount: 0,
      stoppedByLimit: false
    }),

  recordEvent: (payload) => {
    if (!get().isRecording) return REJECTED_EVENT

    if (payload.kind === 'unsupported') {
      set((state) => ({ unsupportedStepCount: state.unsupportedStepCount + 1 }))
      return { accepted: true, autoStopped: false }
    }

    const step = payload.kind === 'click' ? stepFromClick(payload) : stepFromChange(payload)
    let result = REJECTED_EVENT
    set((state) => {
      if (!state.isRecording) return state

      if (step.tool === 'BrowserType') {
        const lastIndex = state.steps.length - 1
        const lastStep = state.steps[lastIndex]
        const sameSelector =
          lastStep && stringArg(lastStep, 'selector') === stringArg(step, 'selector')

        if (sameSelector && lastStep.tool === 'BrowserType') {
          result = { accepted: true, autoStopped: false }
          return { steps: [...state.steps.slice(0, lastIndex), step] }
        }

        // Focusing an input often emits a click immediately before its change event. BrowserType
        // already focuses the field, so keeping that click would make the recorded order brittle.
        if (sameSelector && lastStep.tool === 'BrowserClick') {
          result = { accepted: true, autoStopped: false }
          return { steps: [...state.steps.slice(0, lastIndex), step] }
        }
      }

      const appended = appendStep(state, step)
      result = { accepted: appended.accepted, autoStopped: appended.autoStopped }
      return {
        steps: appended.steps,
        isRecording: appended.isRecording,
        stoppedByLimit: appended.stoppedByLimit
      }
    })
    return result
  },

  recordNavigation: (url) => {
    const normalizedUrl = url.trim()
    if (!normalizedUrl || !get().isRecording) return REJECTED_EVENT

    let result = REJECTED_EVENT
    set((state) => {
      if (!state.isRecording) return state
      const previousUrl = state.steps.at(-1)?.pageUrl || state.startUrl
      if (previousUrl === normalizedUrl) return state

      const appended = appendStep(state, {
        tool: 'BrowserNavigate',
        args: { url: normalizedUrl },
        description: `打开 ${normalizedUrl}`,
        pageUrl: normalizedUrl
      })
      result = { accepted: appended.accepted, autoStopped: appended.autoStopped }
      return {
        steps: appended.steps,
        isRecording: appended.isRecording,
        stoppedByLimit: appended.stoppedByLimit
      }
    })
    return result
  },

  removeStep: (index) => {
    set((state) => ({ steps: state.steps.filter((_, stepIndex) => stepIndex !== index) }))
  }
}))
