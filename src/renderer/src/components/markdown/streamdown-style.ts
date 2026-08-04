import type { CSSProperties } from 'react'

const SAFE_HTML_STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  'alignContent',
  'alignItems',
  'alignSelf',
  'background',
  'backgroundColor',
  'border',
  'borderBlock',
  'borderBlockEnd',
  'borderBlockStart',
  'borderBottom',
  'borderColor',
  'borderInline',
  'borderInlineEnd',
  'borderInlineStart',
  'borderLeft',
  'borderBottomWidth',
  'borderRadius',
  'borderRight',
  'borderStyle',
  'borderTop',
  'borderWidth',
  'boxShadow',
  'boxSizing',
  'color',
  'columnGap',
  'display',
  'flex',
  'flexBasis',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'gap',
  'gridAutoColumns',
  'gridAutoFlow',
  'gridAutoRows',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowStart',
  'gridTemplateColumns',
  'gridTemplateRows',
  'height',
  'justifyItems',
  'justifyContent',
  'justifySelf',
  'letterSpacing',
  'lineHeight',
  'margin',
  'marginBlock',
  'marginBlockEnd',
  'marginBlockStart',
  'marginBottom',
  'marginInline',
  'marginInlineEnd',
  'marginInlineStart',
  'marginLeft',
  'marginRight',
  'marginTop',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'order',
  'overflow',
  'overflowX',
  'overflowY',
  'padding',
  'paddingBlock',
  'paddingBlockEnd',
  'paddingBlockStart',
  'paddingBottom',
  'paddingInline',
  'paddingInlineEnd',
  'paddingInlineStart',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'placeContent',
  'placeItems',
  'placeSelf',
  'position',
  'rowGap',
  'textAlign',
  'top',
  'right',
  'bottom',
  'left',
  'transform',
  'verticalAlign',
  'whiteSpace',
  'width',
  'zIndex'
])

const KATEX_SAFE_HTML_STYLE_PROPERTIES = new Set([...SAFE_HTML_STYLE_PROPERTIES, 'top'])
const UNSAFE_STYLE_VALUE_RE = /(?:url\s*\(|expression\s*\(|javascript:|@import|[<>{}])/i
const CSS_VARIABLE_REFERENCE_RE = /var\s*\(\s*(--[a-z0-9_-]+)/giu
const CSS_VARIABLE_FUNCTION_RE = /var\s*\(/giu
const SAFE_THEME_VARIABLES = new Set([
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--font-sans',
  '--font-serif',
  '--font-mono',
  '--font-chat',
  '--font-chat-weight',
  '--font-chat-strong-weight',
  '--radius',
  '--spacing'
])

function referencesOnlyThemeVariables(value: string): boolean {
  const functionCount = value.match(CSS_VARIABLE_FUNCTION_RE)?.length ?? 0
  if (functionCount === 0) return true

  CSS_VARIABLE_REFERENCE_RE.lastIndex = 0
  let referenceCount = 0
  for (
    let match = CSS_VARIABLE_REFERENCE_RE.exec(value);
    match;
    match = CSS_VARIABLE_REFERENCE_RE.exec(value)
  ) {
    referenceCount += 1
    if (!SAFE_THEME_VARIABLES.has(match[1])) return false
  }
  return referenceCount === functionCount
}

function isSafeHTMLStyleValue(value: string | number): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  const normalizedValue = value.trim()
  return (
    Boolean(normalizedValue) &&
    normalizedValue.length <= 120 &&
    !UNSAFE_STYLE_VALUE_RE.test(normalizedValue) &&
    referencesOnlyThemeVariables(normalizedValue)
  )
}

function sanitizeStyle(
  style: CSSProperties | undefined,
  safeProperties: ReadonlySet<string>
): CSSProperties | undefined {
  if (!style) return undefined

  const safeStyle: Record<string, string | number> = {}
  for (const [property, value] of Object.entries(style)) {
    if (
      safeProperties.has(property) &&
      (typeof value === 'string' || typeof value === 'number') &&
      isSafeHTMLStyleValue(value)
    ) {
      safeStyle[property] = value
    }
  }
  return Object.keys(safeStyle).length > 0 ? safeStyle : undefined
}

export function sanitizeHTMLStyle(style: CSSProperties | undefined): CSSProperties | undefined {
  return sanitizeStyle(style, SAFE_HTML_STYLE_PROPERTIES)
}

export function sanitizeKatexHTMLStyle(
  style: CSSProperties | undefined
): CSSProperties | undefined {
  return sanitizeStyle(style, KATEX_SAFE_HTML_STYLE_PROPERTIES)
}
