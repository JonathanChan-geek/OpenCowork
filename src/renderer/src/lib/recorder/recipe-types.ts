export const RECIPE_FORMAT_VERSION = '1'

export interface RecordedStep {
  /** 映射到现有浏览器工具:BrowserNavigate | BrowserClick | BrowserType */
  tool: 'BrowserNavigate' | 'BrowserClick' | 'BrowserType'
  /** 与该工具 inputSchema 一致的参数,如 { url } / { selector } / { selector, text, pressEnter? } */
  args: Record<string, unknown>
  /** 捕获时的元素文本/标签等上下文,帮 agent 在选择器失效时自愈 */
  hint?: string
  /** 机械生成的人话描述,如「点击 登录 按钮」 */
  description: string
  /** 发生时的页面 URL */
  pageUrl: string
}

export interface RecordedRecipe {
  formatVersion: typeof RECIPE_FORMAT_VERSION
  name: string
  title: string
  description: string
  startUrl: string
  steps: RecordedStep[]
  recordedAt: string
}
