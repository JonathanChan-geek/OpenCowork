/* eslint-disable react/prop-types -- Streamdown supplies typed component overrides dynamically. */
import * as React from 'react'
import { ChevronDown, CornerUpLeft, Download, Eye, Maximize2, WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { openMarkdownHref } from '@renderer/lib/preview/viewers/markdown-components'
import { sanitizeHTMLStyle } from './streamdown-style'

const CODE_BLOCK_COLLAPSE_LINE_THRESHOLD = 16
const DEFAULT_CODE_BLOCK_LANGUAGE = 'markdown'

type CollapsiblePreProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: React.ReactNode
  node?: unknown
  'data-markdown-source-line'?: string | number
}

type StreamdownCodeChildProps = {
  children?: React.ReactNode
  className?: string
  'data-block'?: string
}

type MarkdownLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: React.ReactNode
  href?: string
}

type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  alt?: string
  src?: string
}

export type MarkdownImageActions = {
  canEditImage?: (src: string) => boolean
  onEditImage?: (src: string) => void
}

export type ArtifactPreviewKind = 'html' | 'css' | 'javascript'

export type MarkdownArtifactActions = {
  onOpenCodeArtifact: (artifact: {
    code: string
    language: string
    kind: ArtifactPreviewKind
  }) => void
}

type MarkdownParagraphProps = React.HTMLAttributes<HTMLParagraphElement> & {
  children?: React.ReactNode
  node?: unknown
}

type MarkdownStrongProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode
  node?: unknown
}

type MarkdownHeadingProps = React.HTMLAttributes<HTMLHeadingElement> & {
  children?: React.ReactNode
}

const StreamdownLinkContext = React.createContext(false)
const FootnoteBackrefGroupContext = React.createContext(false)
export const MarkdownImageActionsContext = React.createContext<MarkdownImageActions | null>(null)
export const MarkdownArtifactActionsContext = React.createContext<MarkdownArtifactActions | null>(
  null
)

function isFootnoteBackref(props: React.AnchorHTMLAttributes<HTMLAnchorElement>): boolean {
  return 'data-footnote-backref' in props
}

function isFootnoteReference(props: React.AnchorHTMLAttributes<HTMLAnchorElement>): boolean {
  return 'data-footnote-ref' in props
}

function scrollToHashTarget(href: string, scope: HTMLElement | null): boolean {
  if (!href.includes('#')) return false
  let rawID = ''
  try {
    rawID = new URL(href, window.location.href).hash.slice(1)
  } catch {
    return false
  }
  if (!rawID) return false

  let decodedID = rawID
  try {
    decodedID = decodeURIComponent(rawID)
  } catch {
    // Keep the encoded fragment when it is not valid percent-encoding.
  }
  const candidateIDs = [rawID, decodedID, `user-content-${rawID}`, `user-content-${decodedID}`]
  const findTarget = (root: ParentNode): HTMLElement | null =>
    Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((element) =>
      candidateIDs.includes(element.id)
    ) ?? null
  const target = (scope ? findTarget(scope) : null) ?? findTarget(document)
  if (!target) return false
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  return true
}

function getReactNodeText(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child)
      if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
        return getReactNodeText(child.props.children)
      }
      return ''
    })
    .join('')
}

function FootnoteBackrefContent({
  children,
  ariaLabel
}: {
  children: React.ReactNode
  ariaLabel?: string
}): React.JSX.Element {
  const { t } = useTranslation('chat')
  const shouldShowIndex = React.useContext(FootnoteBackrefGroupContext)
  const match = ariaLabel?.trim().match(/(\d+)(?:-(\d+))?$/)
  const index = (match?.[2] ?? getReactNodeText(children).replace('↩', '').trim()) || '1'
  return (
    <>
      <CornerUpLeft className="size-3.5" strokeWidth={1.8} />
      {shouldShowIndex ? <span className="ml-0.5 text-[10px] leading-none">{index}</span> : null}
      <span className="sr-only">{t('streamMarkdown.back')}</span>
    </>
  )
}

function getCodeTextFromChild(child: React.ReactElement<StreamdownCodeChildProps>): string {
  const raw = child.props.children
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw))
    return raw.filter((item): item is string => typeof item === 'string').join('')
  return ''
}

function getCodeLanguage(className?: string): string {
  return className?.match(/language-([^\s]+)/)?.[1] ?? ''
}

function ensureCodeBlockLanguage(
  child: React.ReactElement<StreamdownCodeChildProps>
): React.ReactElement<StreamdownCodeChildProps> {
  if (getCodeLanguage(child.props.className)) return child
  return React.cloneElement(child, {
    className: cn(child.props.className, `language-${DEFAULT_CODE_BLOCK_LANGUAGE}`)
  })
}

function isMermaidLanguage(language: string): boolean {
  return language === 'mermaid' || language === 'mmd'
}

function isEmptyReactNode(node: React.ReactNode): boolean {
  return node == null || node === ''
}

function isCodeBlockElement(node: React.ReactNode): boolean {
  return (
    React.isValidElement<{ 'data-block'?: string }>(node) && node.props['data-block'] === 'true'
  )
}

function isImageElement(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === MarkdownImage
}

function isImageLinkElement(node: React.ReactNode): boolean {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node) || node.type !== MarkdownLink) {
    return false
  }
  const children = React.Children.toArray(node.props.children).filter(
    (child) => !isEmptyReactNode(child)
  )
  return children.length === 1 && isImageElement(children[0])
}

function isFootnoteBackrefElement(node: React.ReactNode): boolean {
  return (
    React.isValidElement<React.AnchorHTMLAttributes<HTMLAnchorElement>>(node) &&
    isFootnoteBackref(node.props)
  )
}

function resolveArtifactKind(language: string, code: string): ArtifactPreviewKind | null {
  const normalized = language.toLowerCase()
  if (['html', 'htm', 'xhtml'].includes(normalized)) return 'html'
  if (['css', 'scss', 'sass', 'less'].includes(normalized)) return 'css'
  if (['js', 'javascript', 'mjs', 'cjs'].includes(normalized)) return 'javascript'
  if (
    (!normalized || normalized === 'markdown') &&
    /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<(?:article|canvas|div|main|section|style|script|svg)\b)/i.test(
      code
    )
  ) {
    return 'html'
  }
  return null
}

export function CollapsibleCodePre({
  children,
  node: _node,
  'data-markdown-source-line': sourceLine
}: CollapsiblePreProps): React.ReactNode {
  const { t } = useTranslation('chat')
  const artifactActions = React.useContext(MarkdownArtifactActionsContext)
  const childElement = React.isValidElement<StreamdownCodeChildProps>(children)
    ? ensureCodeBlockLanguage(children)
    : null
  const codeContent = childElement ? getCodeTextFromChild(childElement) : ''
  const lineCount = codeContent ? codeContent.replace(/\n$/, '').split('\n').length : 0
  const language = childElement ? getCodeLanguage(childElement.props.className) : ''
  const artifactKind = resolveArtifactKind(language, codeContent)
  const mermaid = isMermaidLanguage(language)
  const isCollapsible =
    childElement != null && !mermaid && lineCount > CODE_BLOCK_COLLAPSE_LINE_THRESHOLD
  const [expanded, setExpanded] = React.useState(false)

  if (!childElement) return children
  const codeBlock = React.cloneElement(childElement, { 'data-block': 'true' })
  const artifactButton =
    artifactActions && artifactKind && codeContent.trim() ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('streamMarkdown.openPreview')}
            className="absolute right-8 top-0 z-20 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            onClick={() =>
              artifactActions.onOpenCodeArtifact({
                code: codeContent,
                language,
                kind: artifactKind
              })
            }
          >
            <Eye className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('streamMarkdown.openPreview')}</TooltipContent>
      </Tooltip>
    ) : null

  if (!isCollapsible) {
    return (
      <div className="relative w-full" data-markdown-source-line={sourceLine}>
        {artifactButton}
        {codeBlock}
      </div>
    )
  }

  return (
    <div className="relative w-full" data-markdown-source-line={sourceLine}>
      {artifactButton}
      <div
        className={cn(
          "w-full [&_[data-streamdown='code-block-body']]:transition-[max-height] [&_[data-streamdown='code-block-body']]:duration-300",
          !expanded &&
            "[mask-image:linear-gradient(to_bottom,#000_calc(100%_-_3rem),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_calc(100%_-_3rem),transparent)] [&_[data-streamdown='code-block-body']]:max-h-[22rem] [&_[data-streamdown='code-block-body']]:overflow-hidden"
        )}
      >
        {codeBlock}
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          <span>
            {expanded
              ? t('streamMarkdown.collapse')
              : t('streamMarkdown.expand', { count: lineCount })}
          </span>
        </button>
      </div>
    </div>
  )
}

export function MarkdownLink({
  children,
  className,
  href,
  onClick,
  style,
  ...props
}: MarkdownLinkProps): React.ReactNode {
  const { t } = useTranslation('chat')
  const incomplete = href === 'streamdown:incomplete-link'
  const footnoteBackref = isFootnoteBackref(props)
  const footnoteReference = isFootnoteReference(props)
  const normalizedChildren = React.Children.toArray(children).filter(
    (child) => !isEmptyReactNode(child)
  )
  const hasBlockChild = normalizedChildren.some(
    (child) => isImageElement(child) || isImageLinkElement(child) || isCodeBlockElement(child)
  )

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      if (!href || incomplete) {
        event.preventDefault()
        return
      }

      // Keep OpenCowork's file-preview and shell-open behavior as the first link handler.
      if (openMarkdownHref(href)) {
        event.preventDefault()
        return
      }
      if (
        href.includes('#') &&
        scrollToHashTarget(href, event.currentTarget.closest('[data-chat-markdown-scope]'))
      ) {
        event.preventDefault()
      }
    },
    [href, incomplete, onClick]
  )

  if (!href || incomplete) {
    if (hasBlockChild) {
      return <StreamdownLinkContext.Provider value>{children}</StreamdownLinkContext.Provider>
    }
    return (
      <span
        className={cn('wrap-anywhere font-medium text-primary underline', className)}
        data-incomplete={incomplete || undefined}
        data-streamdown="link"
      >
        {children}
      </span>
    )
  }

  return (
    <a
      {...props}
      aria-label={footnoteBackref ? t('streamMarkdown.footnoteBackref') : props['aria-label']}
      className={cn(
        'wrap-anywhere cursor-pointer font-medium text-primary underline underline-offset-2',
        footnoteReference && 'text-[0.72em] no-underline',
        footnoteBackref &&
          'ml-1 inline-flex align-baseline text-muted-foreground/75 no-underline hover:text-muted-foreground',
        className
      )}
      data-streamdown="link"
      href={href}
      style={sanitizeHTMLStyle(style)}
      onClick={handleClick}
    >
      <StreamdownLinkContext.Provider value>
        {footnoteBackref ? (
          <FootnoteBackrefContent ariaLabel={props['aria-label']}>
            {children}
          </FootnoteBackrefContent>
        ) : (
          children
        )}
      </StreamdownLinkContext.Provider>
    </a>
  )
}

export function MarkdownImage({
  alt,
  className,
  onError,
  onLoad,
  src,
  ...props
}: MarkdownImageProps): React.ReactNode {
  const { t } = useTranslation('chat')
  const insideLink = React.useContext(StreamdownLinkContext)
  const imageActions = React.useContext(MarkdownImageActionsContext)
  const [loaded, setLoaded] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)

  if (!src) return null
  const canUseImageActions = !insideLink && !failed
  const canEditImage = Boolean(
    imageActions?.onEditImage && (imageActions.canEditImage?.(src) ?? true)
  )

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = src
    link.download = alt?.trim() || src.split('/').pop()?.split('?')[0] || 'image'
    link.rel = 'noreferrer'
    link.click()
  }

  return (
    <span
      className={cn('group relative my-4 block w-fit max-w-full sm:max-w-[32rem]', className)}
      data-streamdown="image-wrapper"
    >
      {failed ? (
        <span className="flex min-h-28 min-w-48 items-center justify-center rounded-xl border border-border bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
          {alt?.trim() || t('streamMarkdown.imageUnavailable')}
        </span>
      ) : (
        <img
          {...props}
          alt={alt}
          className="block h-auto max-h-[34rem] w-auto max-w-full rounded-xl border border-border/60 bg-muted/10 object-contain"
          loading="lazy"
          src={src}
          onError={(event) => {
            setLoaded(false)
            setFailed(true)
            onError?.(event)
          }}
          onLoad={(event) => {
            setLoaded(true)
            setFailed(false)
            onLoad?.(event)
          }}
        />
      )}
      {canUseImageActions ? (
        <span
          className={cn(
            'absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/88 p-1 text-muted-foreground shadow-sm transition-opacity',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('streamMarkdown.previewImage')}
                className="inline-flex size-7 items-center justify-center rounded-full hover:bg-accent hover:text-foreground"
                onClick={() => setPreviewOpen(true)}
              >
                <Maximize2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('streamMarkdown.previewImage')}</TooltipContent>
          </Tooltip>
          {canEditImage ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('streamMarkdown.editImage')}
                  className="inline-flex size-7 items-center justify-center rounded-full hover:bg-accent hover:text-foreground"
                  onClick={() => imageActions?.onEditImage?.(src)}
                >
                  <WandSparkles className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('streamMarkdown.editImage')}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('streamMarkdown.downloadImage')}
                className="inline-flex size-7 items-center justify-center rounded-full hover:bg-accent hover:text-foreground"
                onClick={handleDownload}
              >
                <Download className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('streamMarkdown.downloadImage')}</TooltipContent>
          </Tooltip>
        </span>
      ) : null}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-fit max-w-[96vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[96vw]">
          <DialogTitle className="sr-only">
            {alt?.trim() || t('streamMarkdown.previewImage')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('streamMarkdown.previewImage')}
          </DialogDescription>
          <img
            alt={alt}
            className="block max-h-[92vh] max-w-[96vw] rounded-lg border border-border/50 bg-background/5 object-contain shadow-2xl"
            src={src}
          />
        </DialogContent>
      </Dialog>
    </span>
  )
}

export function MarkdownParagraph({
  children,
  className,
  node: _node,
  style,
  ...props
}: MarkdownParagraphProps): React.ReactNode {
  const normalizedChildren = React.Children.toArray(children).filter(
    (child) => !isEmptyReactNode(child)
  )
  if (
    normalizedChildren.length === 1 &&
    (isImageElement(normalizedChildren[0]) ||
      isImageLinkElement(normalizedChildren[0]) ||
      isCodeBlockElement(normalizedChildren[0]))
  ) {
    return children
  }
  const backrefCount = normalizedChildren.filter(isFootnoteBackrefElement).length
  return (
    <p
      {...props}
      className={cn('min-w-0 max-w-full break-words [overflow-wrap:anywhere]', className)}
      style={sanitizeHTMLStyle(style)}
    >
      {backrefCount > 1 ? (
        <FootnoteBackrefGroupContext.Provider value>
          {children}
        </FootnoteBackrefGroupContext.Provider>
      ) : (
        children
      )}
    </p>
  )
}

export function MarkdownStrong({
  children,
  className,
  node: _node,
  style,
  ...props
}: MarkdownStrongProps): React.JSX.Element {
  return (
    <strong
      {...props}
      className={cn('font-bold text-foreground', className)}
      style={{ ...sanitizeHTMLStyle(style), fontWeight: 'var(--font-chat-strong-weight)' }}
    >
      {children}
    </strong>
  )
}

export function ThinkingHeading({ children, ...props }: MarkdownHeadingProps): React.JSX.Element {
  return <p {...props}>{children}</p>
}
