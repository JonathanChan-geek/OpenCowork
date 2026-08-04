/* eslint-disable react/prop-types -- Streamdown supplies typed component overrides dynamically. */
import * as React from 'react'

import { cn } from '@renderer/lib/utils'
import {
  containsGFMTable,
  containsMarkdownInlineFormatting,
  containsMarkdownMath
} from './streamdown-content'
import { sanitizeHTMLStyle, sanitizeKatexHTMLStyle } from './streamdown-style'

type MarkdownHTMLBlockProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode
  node?: unknown
}

type MarkdownHTMLInlineProps = React.HTMLAttributes<HTMLSpanElement> & {
  children?: React.ReactNode
  node?: unknown
}

type MarkdownHTMLDetailsProps = React.DetailsHTMLAttributes<HTMLDetailsElement> & {
  children?: React.ReactNode
  node?: unknown
}

type MarkdownHTMLMarkdownRenderer = (source: string) => React.ReactNode

export const MarkdownHTMLMarkdownRendererContext =
  React.createContext<MarkdownHTMLMarkdownRenderer | null>(null)

const INLINE_MARKDOWN_STRONG_RE = /(\*\*|__)([\s\S]+?)\1/g
const HTML_MARKDOWN_SOURCE_MAX_LENGTH = 64_000
const HTML_MARKDOWN_SOURCE_MAX_LINES = 800
const KATEX_SPAN_CLASS_NAMES = new Set([
  'katex',
  'katex-display',
  'katex-html',
  'katex-mathml',
  'base',
  'strut',
  'mord',
  'mop',
  'mbin',
  'mrel',
  'mopen',
  'mclose',
  'mpunct',
  'minner',
  'msupsub',
  'vlist',
  'vlist-t',
  'vlist-r',
  'vlist-s',
  'pstrut',
  'sizing',
  'mtight',
  'mspace',
  'mfrac',
  'frac-line',
  'mathrm',
  'mathnormal',
  'mathit',
  'mathbf',
  'textbf',
  'textrm',
  'mainrm'
])

function isKatexSpan(
  className: string | undefined,
  style: React.CSSProperties | undefined
): boolean {
  if (typeof style?.top !== 'undefined') return true
  return (className?.trim().split(/\s+/) ?? []).some(
    (item) =>
      KATEX_SPAN_CLASS_NAMES.has(item) || /^reset-size\d+$/.test(item) || /^size\d+$/.test(item)
  )
}

function getPlainReactNodeText(node: React.ReactNode): string | null {
  let text = ''
  let plain = true
  React.Children.forEach(node, (child) => {
    if (!plain || child == null || typeof child === 'boolean') return
    if (typeof child === 'string' || typeof child === 'number') {
      text += String(child)
      if (text.length > HTML_MARKDOWN_SOURCE_MAX_LENGTH) plain = false
      return
    }
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      child.type === React.Fragment
    ) {
      const fragmentText = getPlainReactNodeText(child.props.children)
      if (fragmentText == null) plain = false
      else text += fragmentText
      return
    }
    plain = false
  })
  return plain ? text : null
}

function normalizeHTMLMarkdownText(source: string): string {
  const trimmed = source.replace(/^\n+|\n+$/g, '')
  const indents = trimmed
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0)
  const minIndent = indents.length ? Math.min(...indents) : 0
  if (minIndent <= 0) return trimmed
  return trimmed
    .split('\n')
    .map((line) => (line.trim() ? line.slice(minIndent) : line))
    .join('\n')
}

function renderInlineStrongMarkdownText(source: string): React.ReactNode {
  if (!containsMarkdownInlineFormatting(source)) return source
  const nodes: React.ReactNode[] = []
  let cursor = 0
  INLINE_MARKDOWN_STRONG_RE.lastIndex = 0
  for (
    let match = INLINE_MARKDOWN_STRONG_RE.exec(source);
    match;
    match = INLINE_MARKDOWN_STRONG_RE.exec(source)
  ) {
    const [raw, , content] = match
    if (!content.trim()) continue
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index))
    nodes.push(
      <strong
        key={`strong-${match.index}`}
        className="font-bold text-foreground"
        style={{ fontWeight: 'var(--font-chat-strong-weight)' }}
      >
        {content}
      </strong>
    )
    cursor = match.index + raw.length
  }
  if (cursor === 0) return source
  if (cursor < source.length) nodes.push(source.slice(cursor))
  return nodes
}

function renderHTMLInlineMarkdownChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return renderInlineStrongMarkdownText(String(child))
    }
    if (
      !React.isValidElement<{ children?: React.ReactNode }>(child) ||
      !('children' in child.props)
    ) {
      return child
    }
    return React.cloneElement(
      child,
      undefined,
      renderHTMLInlineMarkdownChildren(child.props.children)
    )
  })
}

function useHTMLMarkdownChildren(children: React.ReactNode): React.ReactNode {
  const renderMarkdown = React.useContext(MarkdownHTMLMarkdownRendererContext)
  const source = React.useMemo(() => getPlainReactNodeText(children), [children])
  const normalizedSource = React.useMemo(
    () => (source == null ? '' : normalizeHTMLMarkdownText(source)),
    [source]
  )
  const renderedInlineChildren = React.useMemo(
    () =>
      source != null && !containsMarkdownInlineFormatting(source)
        ? children
        : renderHTMLInlineMarkdownChildren(children),
    [children, source]
  )

  if (!renderMarkdown || !normalizedSource.trim()) return renderedInlineChildren
  const lineCount = normalizedSource.split('\n', HTML_MARKDOWN_SOURCE_MAX_LINES + 1).length
  if (
    normalizedSource.length > HTML_MARKDOWN_SOURCE_MAX_LENGTH ||
    lineCount > HTML_MARKDOWN_SOURCE_MAX_LINES ||
    (!containsGFMTable(normalizedSource) && !containsMarkdownMath(normalizedSource))
  ) {
    return renderedInlineChildren
  }
  return renderMarkdown(normalizedSource)
}

export function MarkdownHTMLDiv({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLBlockProps) {
  return (
    <div className={cn('min-w-0 max-w-full', className)} style={sanitizeHTMLStyle(style)}>
      {useHTMLMarkdownChildren(children)}
    </div>
  )
}

export function MarkdownHTMLSection({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLBlockProps) {
  return (
    <section className={cn('min-w-0 max-w-full', className)} style={sanitizeHTMLStyle(style)}>
      {useHTMLMarkdownChildren(children)}
    </section>
  )
}

export function MarkdownHTMLArticle({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLBlockProps) {
  return (
    <article className={cn('min-w-0 max-w-full', className)} style={sanitizeHTMLStyle(style)}>
      {useHTMLMarkdownChildren(children)}
    </article>
  )
}

export function MarkdownHTMLAside({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLBlockProps) {
  return (
    <aside className={cn('min-w-0 max-w-full', className)} style={sanitizeHTMLStyle(style)}>
      {useHTMLMarkdownChildren(children)}
    </aside>
  )
}

export function MarkdownHTMLMain({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLBlockProps) {
  return (
    <main className={cn('min-w-0 max-w-full', className)} style={sanitizeHTMLStyle(style)}>
      {useHTMLMarkdownChildren(children)}
    </main>
  )
}

export function MarkdownHTMLDetails({
  children,
  className,
  node: _node,
  open,
  style
}: MarkdownHTMLDetailsProps) {
  return (
    <details
      className={cn('min-w-0 max-w-full', className)}
      open={open}
      style={sanitizeHTMLStyle(style)}
    >
      {useHTMLMarkdownChildren(children)}
    </details>
  )
}

export function MarkdownHTMLSummary({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLBlockProps) {
  return (
    <summary className={cn('min-w-0 max-w-full', className)} style={sanitizeHTMLStyle(style)}>
      {children}
    </summary>
  )
}

export function MarkdownHTMLSpan({
  children,
  className,
  node: _node,
  style
}: MarkdownHTMLInlineProps) {
  return (
    <span
      className={cn(!isKatexSpan(className, style) && 'min-w-0 max-w-full', className)}
      style={
        isKatexSpan(className, style) ? sanitizeKatexHTMLStyle(style) : sanitizeHTMLStyle(style)
      }
    >
      {children}
    </span>
  )
}
