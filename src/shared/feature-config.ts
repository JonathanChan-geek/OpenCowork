/**
 * Distribution feature switches for the intranet personal build.
 * Flip a flag to restore the upstream feature; do not delete gated code.
 */
export const FEATURES = {
  /** AI Draw page and its sidebar entry */
  draw: false,
  /** Web search settings panel and WebSearchTool default */
  webSearch: false,
  /** ClaudeCode / Codex settings panels and OAuth coding providers */
  aiCoding: false,
  /** CodeGraph settings panel, dashboard entry and codegraph tools default */
  codeGraph: false,
  /** Cloud skills market settings panel (local skills stay available) */
  skillsMarket: false,
  /** Desktop pet settings panel and pet windows */
  pet: false,
  /** Messaging channel plugins (Feishu/DingTalk/QQ/WeCom/Weixin/Discord/Telegram/WhatsApp): settings panel and channel services */
  channels: false,
  /** Auto update check on startup (manual check button stays) */
  autoUpdate: false,
  /** Register the full builtin provider preset catalog; when false only KEPT_BUILTIN_PROVIDER_IDS remain */
  allBuiltinProviders: false,
  /** Clarify / Code / ACP session modes; when false only Cowork (and standalone Chat) remain and the mode picker hides itself */
  extraModes: false,
  /** UI language selector; when false the UI is pinned to Simplified Chinese */
  languageSelector: false,
  /** AGENTS.md "/init" hints in composer placeholder and recommendations (coding workflow) */
  agentsInitHint: false,
  /** Token/TPS/TTFT telemetry bar under the composer (debugging dashboard, noise for end users) */
  runtimeTelemetry: false,
  /** Record built-in browser interactions and save them as local skills */
  workflowRecorder: true
} as const

/** builtinIds that survive when allBuiltinProviders is false */
export const KEPT_BUILTIN_PROVIDER_IDS = new Set<string>(['ollama'])
