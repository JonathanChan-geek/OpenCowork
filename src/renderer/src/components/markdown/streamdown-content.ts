export type RenderSegment =
  | { type: 'markdown'; content: string }
  | { type: 'thinking'; content: string; incomplete: boolean }

type ParseStreamdownSegmentsOptions = {
  normalizeHTMLVisualFences?: boolean
  parseThinking?: boolean
}

const MARKDOWN_LITERAL_FRAGMENT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g
const HTML_VISUAL_MARKDOWN_FENCE_RE =
  /(^|\n)([ \t]{0,3})(```|~~~)[ \t]*(?:(?:markdown|md)[^\n]*)?\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/gi
const HTML_VISUAL_FRAGMENT_RE =
  /^\s*<(?:div|section|article|aside|main|details|table)\b[\s\S]*<\/(?:div|section|article|aside|main|details|table)>\s*$/i
const HTML_VISUAL_STYLE_RE = /\sstyle\s*=\s*["'][^"']{8,}["']/i
const HTML_TAG_RE = /<\/?[A-Za-z][^>\n]*>/g
const ESCAPED_INLINE_DOLLAR_MATH_RE = /\\\$([^$\n]{1,400})\\\$/g
const CURRENCY_DOLLAR_RE = /(^|[^\\$])\$((?:\d{1,3}(?:,\d{3})+|\d+\.\d{1,2}))(?!\$)(?=\b)/g
const GFM_TABLE_DELIMITER_LINE_RE =
  /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/
const MARKDOWN_DISPLAY_MATH_RE = /(?:^|\n)\s*\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\begin\{[a-z*]+\}/i
const MARKDOWN_INLINE_MATH_RE = /(^|[^\\$])\$[^$\n]{1,400}\$/
const MARKDOWN_STRONG_RE = /(^|[^\\])(?:\*\*[^*\n]+?\*\*|__[^_\n]+?__)/
const THINKING_LIKE_HTML_TAG_RE = /<\/?\s*think[\w-]*\b[^>]*>/gi

function mapMarkdownTextFragments(source: string, transform: (fragment: string) => string): string {
  return source
    .split(MARKDOWN_LITERAL_FRAGMENT_RE)
    .map((fragment) => {
      if (
        !fragment ||
        fragment.startsWith('```') ||
        fragment.startsWith('~~~') ||
        fragment.startsWith('`')
      ) {
        return fragment
      }
      return transform(fragment)
    })
    .join('')
}

function looksLikeLatexMathContent(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || /^\d+(?:[.,]\d+)?$/.test(trimmed)) return false
  return (
    /\\[A-Za-z]+/.test(trimmed) ||
    /[\^_{}=<>+\-*/]/.test(trimmed) ||
    /^[A-Za-z]$/.test(trimmed) ||
    /[Α-ω]/.test(trimmed)
  )
}

function isEscapedCharacter(source: string, index: number): boolean {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function getDollarMathDelimiterLength(source: string, index: number): number {
  if (source[index] !== '$' || isEscapedCharacter(source, index) || source[index - 1] === '$') {
    return 0
  }
  if (source[index + 1] === '$' && source[index + 2] !== '$') return 2
  return source[index + 1] === '$' ? 0 : 1
}

function normalizeDollarMathSegments(source: string): string {
  if (!source.includes('$')) return source

  let output = ''
  let consumedUntil = 0
  for (let index = 0; index < source.length; index += 1) {
    const delimiterLength = getDollarMathDelimiterLength(source, index)
    if (!delimiterLength) continue

    let closingIndex = -1
    for (let cursor = index + delimiterLength; cursor < source.length; cursor += 1) {
      if (getDollarMathDelimiterLength(source, cursor) === delimiterLength) {
        closingIndex = cursor
        break
      }
    }
    if (closingIndex < 0) break

    const mathContent = source.slice(index + delimiterLength, closingIndex)
    const inline = delimiterLength === 1
    if (
      inline &&
      (/\n[ \t]*\n/.test(mathContent) || /<\/?\s*(?:div|p|table|pre)\b/i.test(mathContent))
    ) {
      index = closingIndex + delimiterLength - 1
      continue
    }

    if (
      (mathContent.includes('|') || (inline && mathContent.includes('\n'))) &&
      looksLikeLatexMathContent(mathContent)
    ) {
      output += source.slice(consumedUntil, index + delimiterLength)
      output += (inline ? mathContent.replace(/\s*\n\s*/g, ' ') : mathContent).replace(
        /(^|[^\\])\|/g,
        '$1\\vert{}'
      )
      output += source.slice(closingIndex, closingIndex + delimiterLength)
      consumedUntil = closingIndex + delimiterLength
    }
    index = closingIndex + delimiterLength - 1
  }

  return consumedUntil ? output + source.slice(consumedUntil) : source
}

export function normalizeContent(input: unknown): string {
  if (typeof input === 'string') return input
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
    return String(input)
  }
  if (input == null) return ''
  if (Array.isArray(input)) return input.map(normalizeContent).filter(Boolean).join('\n')

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>
    const textValue = record.content ?? record.text ?? record.message
    if (typeof textValue === 'string') return textValue
    try {
      return JSON.stringify(input, null, 2)
    } catch {
      return ''
    }
  }
  return ''
}

export function normalizeMathDelimiters(source: string): string {
  if (!source) return source
  return mapMarkdownTextFragments(source, (fragment) => {
    const normalized = fragment
      .replace(
        /\\\[\s*\n?([\s\S]*?)\n?\s*\\\]/g,
        (_match, math: string) => `$$\n${math.trim()}\n$$`
      )
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
      .replace(ESCAPED_INLINE_DOLLAR_MATH_RE, (match, math: string) =>
        looksLikeLatexMathContent(math) ? `$${math.trim()}$` : match
      )
    return normalizeDollarMathSegments(normalized)
  })
}

export function normalizeCurrencyDollars(source: string): string {
  if (!source.includes('$')) return source
  return mapMarkdownTextFragments(source, (fragment) =>
    fragment.replace(CURRENCY_DOLLAR_RE, (_match, prefix: string, amount: string) => {
      return `${prefix}&#36;${amount}`
    })
  )
}

export function containsGFMTable(source: string): boolean {
  if (!source.includes('|')) return false
  const lines = source.split('\n')
  return lines.some(
    (line, index) =>
      index > 0 && GFM_TABLE_DELIMITER_LINE_RE.test(line) && lines[index - 1].includes('|')
  )
}

export function containsMarkdownMath(source: string): boolean {
  if (!source.includes('$') && !source.includes('\\')) return false
  return MARKDOWN_DISPLAY_MATH_RE.test(source) || MARKDOWN_INLINE_MATH_RE.test(source)
}

export function containsMarkdownInlineFormatting(source: string): boolean {
  if (!source.includes('**') && !source.includes('__')) return false
  return MARKDOWN_STRONG_RE.test(source)
}

const LATEX_UNICODE_SYMBOLS: Array<[RegExp, string]> = [
  [/→/g, ' \\to '],
  [/←/g, ' \\leftarrow '],
  [/⇒/g, ' \\Rightarrow '],
  [/⇐/g, ' \\Leftarrow '],
  [/↔/g, ' \\leftrightarrow '],
  [/⇔/g, ' \\Leftrightarrow ']
]

export function normalizeLatexUnicodeSymbols(source: string): string {
  if (!/[→←⇒⇐↔⇔]/.test(source)) return source
  return mapMarkdownTextFragments(source, (fragment) =>
    LATEX_UNICODE_SYMBOLS.reduce(
      (normalized, [pattern, replacement]) => normalized.replace(pattern, replacement),
      fragment
    )
  )
}

export function normalizeMermaidBlocks(source: string): string {
  if (!/```mermaid/i.test(source)) return source
  return source.replace(/```mermaid([\s\S]*?)```/gi, (block) =>
    block.replace(/<br\s*>/gi, '<br/>').replace(/<br\s*\/\s*>/gi, '<br/>')
  )
}

export function normalizeEscapedHTMLAttributeQuotes(source: string): string {
  if (!source.includes('\\"') && !source.includes("\\'")) return source
  return mapMarkdownTextFragments(source, (fragment) =>
    fragment.replace(HTML_TAG_RE, (tag) => tag.replace(/\\"/g, '"').replace(/\\'/g, "'"))
  )
}

export function normalizeHTMLVisualMarkdownFences(source: string): string {
  if (!source.includes('```') && !source.includes('~~~')) return source
  return source.replace(
    HTML_VISUAL_MARKDOWN_FENCE_RE,
    (match, prefix: string, _indent: string, _fence: string, code: string) => {
      const trimmedCode = code.trim()
      if (!HTML_VISUAL_FRAGMENT_RE.test(trimmedCode) || !HTML_VISUAL_STYLE_RE.test(trimmedCode)) {
        return match
      }
      return `${prefix}${trimmedCode}`
    }
  )
}

export function normalizeHTMLVisualBlankLines(source: string): string {
  return mapMarkdownTextFragments(source, (fragment) =>
    fragment.replace(
      /(<(?:div|section|article|aside|main|details)\b[^>]*>)\n(?:[ \t]*\n)+/gi,
      '$1\n'
    )
  )
}

function escapeThinkingLikeHTMLTags(source: string): string {
  if (!/<\/?\s*think/i.test(source)) return source
  return mapMarkdownTextFragments(source, (fragment) =>
    fragment.replace(THINKING_LIKE_HTML_TAG_RE, (value) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    )
  )
}

export function parseStreamdownSegments(
  source: string,
  { normalizeHTMLVisualFences = true, parseThinking = true }: ParseStreamdownSegmentsOptions = {}
): RenderSegment[] {
  if (!source) return []

  const normalizedSource = normalizeHTMLVisualFences
    ? normalizeHTMLVisualMarkdownFences(source)
    : source
  if (!parseThinking) {
    return normalizedSource.trim()
      ? [{ type: 'markdown', content: escapeThinkingLikeHTMLTags(normalizedSource) }]
      : []
  }

  const firstContentIndex = normalizedSource.search(/\S/)
  if (firstContentIndex < 0) return []
  const openingMatch = /^<(think|thinking)\b[^>]*>/i.exec(normalizedSource.slice(firstContentIndex))
  if (!openingMatch || openingMatch[0].slice(0, -1).trimEnd().endsWith('/')) {
    return [{ type: 'markdown', content: escapeThinkingLikeHTMLTags(normalizedSource) }]
  }

  const tagName = openingMatch[1].toLowerCase()
  const contentStart = firstContentIndex + openingMatch[0].length
  const closingMatch = new RegExp(`</${tagName}\\s*>`, 'i').exec(
    normalizedSource.slice(contentStart)
  )
  if (!closingMatch) {
    return [
      {
        type: 'thinking',
        content: normalizedSource.slice(contentStart),
        incomplete: true
      }
    ]
  }

  const closeStart = contentStart + closingMatch.index
  const closeEnd = closeStart + closingMatch[0].length
  const segments: RenderSegment[] = [
    {
      type: 'thinking',
      content: normalizedSource.slice(contentStart, closeStart),
      incomplete: false
    }
  ]
  const tail = normalizedSource.slice(closeEnd)
  if (tail.trim()) segments.push({ type: 'markdown', content: escapeThinkingLikeHTMLTags(tail) })
  return segments
}
