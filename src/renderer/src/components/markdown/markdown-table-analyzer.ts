export type ColumnType = 'compact' | 'numeric' | 'date' | 'normal' | 'content' | 'code'

export type HeaderRule = {
  pattern: RegExp
  type: ColumnType
  weight?: number
}

export type ColumnAnalyzerThresholds = {
  compactAverageLength: number
  compactMaximumLength: number
  compactRatio: number
  numericRatio: number
  dateRatio: number
  codeRatio: number
  sentenceRatio: number
  contentAverageLength: number
  contentMaximumLength: number
  strongContentAverageLength: number
  longUnbrokenLength: number
  structuredOutlierMaximumLength: number
}

export type ColumnAnalyzerPatterns = {
  numeric: RegExp
  date: RegExp
  boolean: RegExp
  url: RegExp
  path: RegExp
  hash: RegExp
  commandOrCode: RegExp
  sentence: RegExp
  unbroken: RegExp
}

export type ColumnAnalyzerOptions = {
  thresholds?: Partial<ColumnAnalyzerThresholds>
  patterns?: Partial<ColumnAnalyzerPatterns>
  headerRules?: readonly HeaderRule[] | false
  additionalHeaderRules?: readonly HeaderRule[]
}

export type ColumnMetrics = {
  totalCount: number
  nonEmptyCount: number
  distinctCount: number
  averageVisualLength: number
  maximumVisualLength: number
  compactRatio: number
  numericRatio: number
  numericOutlierMaximumVisualLength: number
  dateRatio: number
  dateOutlierMaximumVisualLength: number
  codeRatio: number
  sentenceRatio: number
  longUnbrokenRatio: number
}

export const DEFAULT_COLUMN_ANALYZER_THRESHOLDS: Readonly<ColumnAnalyzerThresholds> = {
  compactAverageLength: 5,
  compactMaximumLength: 12,
  compactRatio: 0.75,
  numericRatio: 0.72,
  dateRatio: 0.6,
  codeRatio: 0.45,
  sentenceRatio: 0.34,
  contentAverageLength: 26,
  contentMaximumLength: 44,
  strongContentAverageLength: 38,
  longUnbrokenLength: 22,
  structuredOutlierMaximumLength: 16
}

export const DEFAULT_COLUMN_ANALYZER_PATTERNS: Readonly<ColumnAnalyzerPatterns> = {
  numeric:
    /^[+\-−]?(?:[$€£¥￥]\s*)?(?:\d{1,3}(?:[,， ]\d{3})+|\d+)(?:[.．]\d+)?(?:\s*(?:%|％|‰|[a-zA-Z]{3}))?$/u,
  date: /^(?:\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(?:[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}|[AP]M))?)?$/iu,
  boolean:
    /^(?:true|false|yes|no|on|off|null|n\/?a|是|否|有|无|启用|禁用|成功|失败|正常|异常|はい|いいえ|真|偽)$/iu,
  url: /^(?:(?:https?|ftp):\/\/|www\.)\S+$/iu,
  path: /^(?:[a-zA-Z]:[\\/]|\.{0,2}\/|~\/|\/)[^\s]+$/u,
  hash: /^(?:[a-f\d]{20,}|[A-Za-z\d_-]{28,})$/u,
  commandOrCode:
    /^(?:[$#>]\s+.+|--?[a-z][\w-]*(?:=\S+)?|[\w.-]+\([^)]*\)|[a-z_$][\w$]*(?:(?:::|\.|\/)[\w.$-]+){2,})$/iu,
  sentence:
    /(?:[。！？.!?]\s*$|[,，、;；:]|\s+(?:and|or|but|because|with|from|that|this|the|to|of|is|are)\s+)/iu,
  unbroken: /[^\s\u3000]{22,}/u
}

export const DEFAULT_HEADER_RULES: readonly HeaderRule[] = [
  {
    pattern: /^(?:id|no\.?|number|index|编号|序号|索引|識別子|番号)$/iu,
    type: 'compact',
    weight: 0.12
  },
  {
    pattern:
      /(?:amount|price|cost|rate|ratio|percent|total|count|金额|价格|比例|百分比|数量|金額|比率|件数)/iu,
    type: 'numeric',
    weight: 0.12
  },
  {
    pattern: /(?:date|time|created|updated|日期|时间|日時|日付|時刻)/iu,
    type: 'date',
    weight: 0.14
  },
  {
    pattern:
      /(?:description|detail|reason|note|advice|summary|说明|详情|原因|建议|备注|描述|説明|詳細|理由|提案)/iu,
    type: 'content',
    weight: 0.14
  },
  {
    pattern:
      /(?:url|uri|link|path|file|hash|command|code|链接|路径|文件|哈希|命令|代码|リンク|パス|コマンド)/iu,
    type: 'code',
    weight: 0.14
  }
]

const WIDE_CHARACTER_RE =
  /[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const TYPE_WIDTH_RANK: Readonly<Record<ColumnType, number>> = {
  compact: 0,
  numeric: 1,
  date: 2,
  normal: 3,
  code: 4,
  content: 5
}

function normalizeValue(value: unknown): string {
  return value == null ? '' : String(value).replace(/\s+/gu, ' ').trim()
}

export function getVisualLength(value: unknown): number {
  let length = 0
  for (const character of normalizeValue(value)) {
    length += WIDE_CHARACTER_RE.test(character) ? 2 : 1
  }
  return length
}

function resolveOptions(options: ColumnAnalyzerOptions): {
  thresholds: ColumnAnalyzerThresholds
  patterns: ColumnAnalyzerPatterns
  headerRules: readonly HeaderRule[] | false
} {
  const rules = options.headerRules === undefined ? DEFAULT_HEADER_RULES : options.headerRules
  return {
    thresholds: { ...DEFAULT_COLUMN_ANALYZER_THRESHOLDS, ...options.thresholds },
    patterns: { ...DEFAULT_COLUMN_ANALYZER_PATTERNS, ...options.patterns },
    headerRules: rules === false ? false : [...rules, ...(options.additionalHeaderRules ?? [])]
  }
}

export function analyzeColumnValues(
  values: readonly unknown[],
  options: ColumnAnalyzerOptions = {}
): ColumnMetrics {
  const { patterns, thresholds } = resolveOptions(options)
  const normalized = values.map(normalizeValue)
  const nonEmpty = normalized.filter(Boolean)
  const lengths = nonEmpty.map(getVisualLength)
  const ratio = (predicate: (value: string) => boolean) =>
    nonEmpty.length ? nonEmpty.filter(predicate).length / nonEmpty.length : 0
  const isCode = (value: string) =>
    patterns.url.test(value) ||
    patterns.path.test(value) ||
    patterns.hash.test(value) ||
    patterns.commandOrCode.test(value)
  const maximumNonMatchingLength = (predicate: (value: string) => boolean) =>
    nonEmpty.reduce(
      (maximum, value) => (predicate(value) ? maximum : Math.max(maximum, getVisualLength(value))),
      0
    )

  return {
    totalCount: normalized.length,
    nonEmptyCount: nonEmpty.length,
    distinctCount: new Set(nonEmpty.map((value) => value.toLocaleLowerCase())).size,
    averageVisualLength: lengths.length
      ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length
      : 0,
    maximumVisualLength: lengths.length ? Math.max(...lengths) : 0,
    compactRatio: ratio(
      (value) =>
        patterns.boolean.test(value) || getVisualLength(value) <= thresholds.compactAverageLength
    ),
    numericRatio: ratio((value) => patterns.numeric.test(value)),
    numericOutlierMaximumVisualLength: maximumNonMatchingLength((value) =>
      patterns.numeric.test(value)
    ),
    dateRatio: ratio((value) => patterns.date.test(value)),
    dateOutlierMaximumVisualLength: maximumNonMatchingLength((value) => patterns.date.test(value)),
    codeRatio: ratio(isCode),
    sentenceRatio: ratio((value) => patterns.sentence.test(value)),
    longUnbrokenRatio: ratio((value) => patterns.unbroken.test(value) && isCode(value))
  }
}

function getHeaderHint(header: unknown, rules: readonly HeaderRule[] | false): ColumnType | null {
  const normalizedHeader = normalizeValue(header)
  if (!normalizedHeader || rules === false) return null
  return rules.find((rule) => rule.pattern.test(normalizedHeader))?.type ?? null
}

export function classifyColumn(
  header: unknown,
  values: readonly unknown[],
  options: ColumnAnalyzerOptions = {}
): ColumnType {
  const config = resolveOptions(options)
  const metrics = analyzeColumnValues(values, options)
  const hint = getHeaderHint(header, config.headerRules)
  const { thresholds } = config
  if (metrics.nonEmptyCount === 0) return 'normal'
  if (metrics.codeRatio >= thresholds.codeRatio || hint === 'code') return 'code'
  if (
    (metrics.dateRatio >= thresholds.dateRatio || hint === 'date') &&
    metrics.dateOutlierMaximumVisualLength <= thresholds.structuredOutlierMaximumLength
  ) {
    return 'date'
  }
  if (
    (metrics.numericRatio >= thresholds.numericRatio || hint === 'numeric') &&
    metrics.numericOutlierMaximumVisualLength <= thresholds.structuredOutlierMaximumLength
  ) {
    return 'numeric'
  }
  if (
    metrics.averageVisualLength >= thresholds.strongContentAverageLength ||
    ((metrics.averageVisualLength >= thresholds.contentAverageLength ||
      metrics.maximumVisualLength >= thresholds.contentMaximumLength) &&
      (metrics.sentenceRatio >= thresholds.sentenceRatio || hint === 'content'))
  ) {
    return 'content'
  }
  if (
    metrics.averageVisualLength <= thresholds.compactAverageLength &&
    metrics.maximumVisualLength <= thresholds.compactMaximumLength &&
    (metrics.compactRatio >= thresholds.compactRatio || hint === 'compact')
  ) {
    return 'compact'
  }
  return 'normal'
}

export function classifyTableColumns(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
  options: ColumnAnalyzerOptions = {}
): ColumnType[] {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 0)
  return Array.from({ length: columnCount }, (_, columnIndex) =>
    classifyColumn(
      headers[columnIndex],
      rows.map((row) => row[columnIndex]),
      options
    )
  )
}

export function mergeColumnType(previousType: ColumnType, nextType: ColumnType): ColumnType {
  return TYPE_WIDTH_RANK[nextType] > TYPE_WIDTH_RANK[previousType] ? nextType : previousType
}
