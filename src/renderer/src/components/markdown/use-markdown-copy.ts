import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const LATEX_COPYABLE_SELECTOR = '.katex, .katex-display'
const LATEX_ANNOTATION_SELECTOR = "annotation[encoding='application/x-tex']"
const LATEX_INTERACTION_EXCLUSION_SELECTOR =
  "a, button, input, textarea, select, summary, pre, code, [contenteditable='true']"
const INLINE_CODE_COPYABLE_SELECTOR = 'code:not(pre code)'
const INLINE_CODE_INTERACTION_EXCLUSION_SELECTOR =
  "a, button, input, textarea, select, summary, [contenteditable='true']"
const MARKDOWN_COPY_POINTER_DRAG_THRESHOLD = 6

type UseMarkdownCopyOptions = {
  contentVersion: string
  renderVersion: unknown
}

type UseMarkdownCopyResult = {
  rootRef: React.RefObject<HTMLDivElement | null>
  onClickCapture: React.MouseEventHandler<HTMLDivElement>
  onKeyDownCapture: React.KeyboardEventHandler<HTMLDivElement>
  onPointerDownCapture: React.PointerEventHandler<HTMLDivElement>
}

type MarkdownCopyTarget = {
  kind: 'inline-code' | 'latex'
  source: string
}

function getHTMLElementFromTarget(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function hasNonCollapsedSelection(): boolean {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

function getLatexSource(element: HTMLElement): string {
  return element.querySelector<HTMLElement>(LATEX_ANNOTATION_SELECTOR)?.textContent?.trim() ?? ''
}

function resolveLatexCopySource(target: EventTarget | null, root: HTMLElement): string {
  const targetElement = getHTMLElementFromTarget(target)
  if (!targetElement || !root.contains(targetElement)) return ''
  if (targetElement.closest(LATEX_INTERACTION_EXCLUSION_SELECTOR)) return ''

  const element =
    targetElement.closest<HTMLElement>('.katex-display') ??
    targetElement.closest<HTMLElement>('.katex')
  if (!element || !root.contains(element)) return ''

  const source = getLatexSource(element)
  if (!source || source.startsWith('$') || source.startsWith('\\(') || source.startsWith('\\[')) {
    return source
  }
  return element.classList.contains('katex-display') || element.closest('.katex-display')
    ? `$$\n${source}\n$$`
    : `$${source}$`
}

function resolveMarkdownCopyTarget(
  target: EventTarget | null,
  root: HTMLElement
): MarkdownCopyTarget | null {
  const targetElement = getHTMLElementFromTarget(target)
  const codeElement = targetElement?.closest<HTMLElement>("[data-inline-code-copyable='true']")
  if (codeElement && root.contains(codeElement) && codeElement.textContent?.trim()) {
    return { kind: 'inline-code', source: codeElement.textContent }
  }

  const latexSource = resolveLatexCopySource(target, root)
  return latexSource ? { kind: 'latex', source: latexSource } : null
}

function annotateLatexElements(root: HTMLElement, label: string): void {
  const seenElements = new Set<HTMLElement>()
  root.querySelectorAll<HTMLElement>(LATEX_COPYABLE_SELECTOR).forEach((element) => {
    const copyElement = element.closest<HTMLElement>('.katex-display') ?? element
    if (seenElements.has(copyElement) || !getLatexSource(copyElement)) return
    seenElements.add(copyElement)
    copyElement.setAttribute('data-latex-copyable', 'true')
    copyElement.setAttribute('tabindex', '0')
    copyElement.setAttribute('role', 'button')
    copyElement.setAttribute('aria-label', label)
    copyElement.setAttribute('title', label)
  })
}

function annotateInlineCodeElements(root: HTMLElement, label: string): void {
  root.querySelectorAll<HTMLElement>(INLINE_CODE_COPYABLE_SELECTOR).forEach((element) => {
    if (
      !element.textContent?.trim() ||
      element.closest(INLINE_CODE_INTERACTION_EXCLUSION_SELECTOR)
    ) {
      return
    }
    element.setAttribute('data-inline-code-copyable', 'true')
    element.setAttribute('tabindex', '0')
    element.setAttribute('role', 'button')
    element.setAttribute('aria-label', label)
    element.setAttribute('title', label)
  })
}

export function useMarkdownCopy({
  contentVersion,
  renderVersion
}: UseMarkdownCopyOptions): UseMarkdownCopyResult {
  const { t } = useTranslation('chat')
  const rootRef = React.useRef<HTMLDivElement>(null)
  const pointerDownRef = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    annotateLatexElements(root, t('streamMarkdown.copyLatex'))
    annotateInlineCodeElements(root, t('streamMarkdown.copy'))
  }, [contentVersion, renderVersion, t])

  const copyMarkdownTarget = React.useCallback(
    async (target: MarkdownCopyTarget) => {
      try {
        await navigator.clipboard.writeText(target.source)
        toast.success(
          t(target.kind === 'latex' ? 'streamMarkdown.latexCopied' : 'streamMarkdown.copied')
        )
      } catch {
        toast.error(
          t(
            target.kind === 'latex' ? 'streamMarkdown.latexCopyFailed' : 'streamMarkdown.copyFailed'
          )
        )
      }
    },
    [t]
  )

  const onPointerDownCapture = React.useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      pointerDownRef.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
    },
    []
  )

  const onClickCapture = React.useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        hasNonCollapsedSelection()
      ) {
        return
      }

      const pointerDown = pointerDownRef.current
      if (
        pointerDown &&
        (Math.abs(event.clientX - pointerDown.x) > MARKDOWN_COPY_POINTER_DRAG_THRESHOLD ||
          Math.abs(event.clientY - pointerDown.y) > MARKDOWN_COPY_POINTER_DRAG_THRESHOLD)
      ) {
        return
      }

      const root = rootRef.current
      if (!root) return
      const target = resolveMarkdownCopyTarget(event.target, root)
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      void copyMarkdownTarget(target)
    },
    [copyMarkdownTarget]
  )

  const onKeyDownCapture = React.useCallback<React.KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return
      const targetElement = getHTMLElementFromTarget(event.target)
      if (
        !targetElement?.hasAttribute('data-latex-copyable') &&
        !targetElement?.hasAttribute('data-inline-code-copyable')
      ) {
        return
      }

      const root = rootRef.current
      if (!root) return
      const target = resolveMarkdownCopyTarget(event.target, root)
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      void copyMarkdownTarget(target)
    },
    [copyMarkdownTarget]
  )

  return { rootRef, onClickCapture, onKeyDownCapture, onPointerDownCapture }
}
