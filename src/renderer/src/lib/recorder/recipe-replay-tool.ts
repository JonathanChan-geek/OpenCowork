import { toolRegistry } from '../agent/tool-registry'
import { encodeStructuredToolResult, encodeToolError } from '../tools/tool-result-format'
import type { ToolContext, ToolHandler } from '../tools/tool-types'
import type { ToolResultContent } from '../api/types'
import { ipcClient } from '../ipc/ipc-client'
import { IPC } from '../ipc/channels'
import { RECIPE_FORMAT_VERSION, type RecordedRecipe, type RecordedStep } from './recipe-types'

/**
 * Deterministic replayer for recorded browser workflows (the sidebar_agent recipe
 * philosophy): the plan lives in data, not in the model. The agent only decides to
 * call this tool; every step then executes without another model round-trip. On the
 * first hard failure the tool stops and returns a structured report so the agent can
 * take over from the exact failing step with BrowserSnapshot + the recorded hint.
 *
 * Execution routing mirrors the other Browser* tools: the registry entry below is a
 * definition-only stub; the native worker routes the call back through
 * browser/tool-request and browser-native-ui injects its runBrowserTool executor.
 */

export const REPLAY_TOOL_NAME = 'ReplayRecordedWorkflow'

/** Only the tools the P1 recorder can emit; a hand-crafted SKILL.md cannot make the
 * replayer call anything else. */
const REPLAYABLE_TOOLS = new Set<RecordedStep['tool']>([
  'BrowserNavigate',
  'BrowserClick',
  'BrowserType'
])

const STEP_SETTLE_MS = 500
const RETRY_DELAY_MS = 1200

export type BrowserStepRunner = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<ToolResultContent>

export type CurrentUrlGetter = () => string | null

interface StepOverride {
  step: number
  args: Record<string, unknown>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractRecipeJson(skillContent: string): RecordedRecipe | null {
  // The recorder always emits exactly one fenced json block holding the recipe.
  const match = skillContent.match(/```json\s*\n([\s\S]*?)\n```/)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as RecordedRecipe
  } catch {
    return null
  }
}

function validateRecipe(recipe: RecordedRecipe): string | null {
  if (recipe.formatVersion !== RECIPE_FORMAT_VERSION) {
    return `Unsupported recipe formatVersion: ${String(recipe.formatVersion)}`
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    return 'Recipe has no steps'
  }
  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i]
    if (!REPLAYABLE_TOOLS.has(step.tool)) {
      return `Step ${i + 1} uses non-replayable tool: ${String(step.tool)}`
    }
    if (!step.args || typeof step.args !== 'object') {
      return `Step ${i + 1} has no args`
    }
  }
  return null
}

function containsPasswordPlaceholder(args: Record<string, unknown>): boolean {
  return Object.values(args).some(
    (value) => typeof value === 'string' && value.includes('{{PASSWORD}}')
  )
}

function applyOverrides(steps: RecordedStep[], overrides: StepOverride[]): RecordedStep[] {
  if (overrides.length === 0) return steps
  const byIndex = new Map<number, Record<string, unknown>>()
  for (const override of overrides) {
    byIndex.set(override.step, override.args)
  }
  return steps.map((step, index) => {
    const patch = byIndex.get(index + 1)
    if (!patch) return step
    return { ...step, args: { ...step.args, ...patch } }
  })
}

function softErrorMessage(content: ToolResultContent): string | null {
  // Browser executors report soft failures through encodeToolError, which yields a
  // text payload starting with an error marker. Fall back to null for structured
  // success payloads.
  if (typeof content === 'string') {
    return /^\s*(Error|错误)[:：]/i.test(content) ? content.slice(0, 400) : null
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        'type' in block &&
        (block as { type?: string }).type === 'text'
      ) {
        const text = String((block as { text?: unknown }).text ?? '')
        if (/^\s*(Error|错误)[:：]/i.test(text)) return text.slice(0, 400)
      }
    }
  }
  return null
}

export async function executeRecipeReplay(
  input: Record<string, unknown>,
  _ctx: ToolContext,
  runBrowserStep: BrowserStepRunner,
  getCurrentUrl?: CurrentUrlGetter
): Promise<ToolResultContent> {
  const skillName = typeof input.skillName === 'string' ? input.skillName.trim() : ''
  if (!skillName) return encodeToolError('skillName is required')

  let content = ''
  try {
    const read = (await ipcClient.invoke(IPC.SKILLS_READ, { name: skillName })) as
      | { content: string }
      | { error: string }
    if ('error' in read) return encodeToolError(`Failed to read skill: ${read.error}`)
    content = read.content
  } catch (error) {
    return encodeToolError(
      `Failed to read skill "${skillName}": ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const recipe = extractRecipeJson(content)
  if (!recipe) {
    return encodeToolError(
      `Skill "${skillName}" does not contain a recorded recipe JSON block; it is not replayable.`
    )
  }
  const invalid = validateRecipe(recipe)
  if (invalid) return encodeToolError(invalid)

  const rawOverrides = Array.isArray(input.overrides) ? (input.overrides as StepOverride[]) : []
  const overrides = rawOverrides.filter(
    (item) =>
      item &&
      typeof item.step === 'number' &&
      item.step >= 1 &&
      item.step <= recipe.steps.length &&
      !!item.args &&
      typeof item.args === 'object'
  )
  const steps = applyOverrides(recipe.steps, overrides)

  for (let i = 0; i < steps.length; i++) {
    if (containsPasswordPlaceholder(steps[i].args)) {
      return encodeToolError(
        `Step ${i + 1} contains a {{PASSWORD}} placeholder. Refusing deterministic replay; ` +
          'execute the credential step manually with user-provided input.'
      )
    }
  }

  const runOnce = async (step: RecordedStep): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await runBrowserStep(step.tool, step.args)
      const soft = softErrorMessage(result)
      return soft ? { ok: false, error: soft } : { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // The recorded start page is recipe metadata, not a step; opening it first both
  // honors the recipe contract and attaches the browser view for a fresh session.
  const startUrl = typeof recipe.startUrl === 'string' ? recipe.startUrl.trim() : ''
  const firstStep = steps[0]
  const firstStepIsSameNavigate =
    firstStep?.tool === 'BrowserNavigate' &&
    typeof firstStep.args.url === 'string' &&
    firstStep.args.url.trim() === startUrl
  if (startUrl && !firstStepIsSameNavigate) {
    const opened = await runOnce({
      tool: 'BrowserNavigate',
      args: { url: startUrl },
      description: `打开起始页 ${startUrl}`,
      pageUrl: startUrl
    })
    if (!opened.ok) {
      return encodeStructuredToolResult({
        success: false,
        skillName,
        executedSteps: 0,
        totalSteps: steps.length,
        failedStep: {
          index: 0,
          tool: 'BrowserNavigate',
          description: `打开起始页 ${startUrl}`,
          hint: null,
          error: opened.error ?? 'unknown error'
        },
        takeoverAdvice:
          'Could not open the recipe start page. Check the URL is reachable, then retry or continue manually.'
      })
    }
    await sleep(STEP_SETTLE_MS)
  }

  const overriddenSteps = new Set(overrides.map((item) => item.step))
  const executed: Array<{
    step: number
    description: string
    retried: boolean
    skipped?: boolean
  }> = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    // A BrowserNavigate recorded right after a click/type is usually the *effect* of
    // that click, not a user action: replaying it verbatim would drag the page back
    // to the originally recorded destination (wrong whenever inputs were overridden).
    // If the click already navigated somewhere, trust the live flow and skip the
    // forced goto — unless the caller explicitly overrode this step's url.
    const prev = i > 0 ? steps[i - 1] : null
    if (
      step.tool === 'BrowserNavigate' &&
      prev &&
      (prev.tool === 'BrowserClick' || prev.tool === 'BrowserType') &&
      !overriddenSteps.has(i + 1) &&
      getCurrentUrl
    ) {
      let navigatedByClick = false
      for (let waited = 0; waited < 4000; waited += 400) {
        const current = getCurrentUrl()
        if (current && current !== prev.pageUrl) {
          navigatedByClick = true
          break
        }
        await sleep(400)
      }
      if (navigatedByClick) {
        executed.push({
          step: i + 1,
          description: `${step.description}（点击已触发导航，跳过强制跳转）`,
          retried: false,
          skipped: true
        })
        continue
      }
    }

    let result = await runOnce(step)
    let retried = false
    if (!result.ok) {
      retried = true
      await sleep(RETRY_DELAY_MS)
      result = await runOnce(step)
    }
    if (!result.ok) {
      return encodeStructuredToolResult({
        success: false,
        skillName,
        executedSteps: executed.length,
        totalSteps: steps.length,
        failedStep: {
          index: i + 1,
          tool: step.tool,
          description: step.description,
          hint: step.hint ?? null,
          error: result.error ?? 'unknown error'
        },
        takeoverAdvice:
          'Deterministic replay stopped. Use BrowserSnapshot to inspect the live page, then continue from the failed step manually using the recorded hint.'
      })
    }
    executed.push({ step: i + 1, description: step.description, retried })
    if (i < steps.length - 1) await sleep(STEP_SETTLE_MS)
  }

  return encodeStructuredToolResult({
    success: true,
    skillName,
    executedSteps: executed.length,
    totalSteps: steps.length,
    steps: executed
  })
}

const replayHandler: ToolHandler = {
  definition: {
    name: REPLAY_TOOL_NAME,
    description:
      'Deterministically replay a recorded browser workflow skill without extra model round-trips.\n\n' +
      'Usage:\n' +
      '- Pass the recorded skill name (a skill whose SKILL.md contains a recorded recipe JSON block).\n' +
      '- Steps run strictly in order in the built-in browser; execution stops at the first failure.\n' +
      '- Use overrides to substitute step arguments before running, e.g. replace recorded search text: ' +
      '[{"step": 1, "args": {"text": "another query"}}]. Step numbers are 1-based.\n' +
      '- On failure the result names the failing step; take over manually with BrowserSnapshot and the recorded hint.\n' +
      '- Recipes containing {{PASSWORD}} placeholders are refused; handle credential steps manually instead.',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'Name of the recorded workflow skill, e.g. "recorded-workflow-abc123".'
        },
        overrides: {
          type: 'array',
          description:
            'Optional per-step argument replacements applied before replay. Each item: {step: 1-based index, args: partial args to merge}.',
          items: {
            type: 'object',
            properties: {
              step: { type: 'number', description: '1-based step index to override.' },
              args: { type: 'object', description: 'Argument fields to merge into the step.' }
            },
            required: ['step', 'args']
          }
        }
      },
      required: ['skillName']
    }
  },
  execute: async () =>
    encodeToolError(
      `${REPLAY_TOOL_NAME} executes in the .NET Native Worker and is unavailable through the renderer boundary.`
    ),
  requiresApproval: () => false
}

export function registerRecipeReplayTool(): void {
  toolRegistry.register(replayHandler)
}
