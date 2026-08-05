/**
 * Capability presets keyed by onboarding interest (professional line) ids.
 *
 * This is the hook that turns "which lines did the user pick" into concrete
 * capability provisioning (bundled skills to install, MCP servers to enable).
 * The asset lists are intentionally empty until the corresponding skills /
 * MCP configs actually land in the repo — an empty preset must stay a no-op
 * so onboarding never promises capabilities that do not exist yet.
 */
export interface InterestCapabilityPreset {
  /** Bundled skill folder names to install via skills:add-from-folder. */
  skills: readonly string[]
  /** MCP server config ids to enable for this professional line. */
  mcpServers: readonly string[]
}

export const INTEREST_CAPABILITY_PRESETS: Record<string, InterestCapabilityPreset> = {
  marketingCounter: { skills: [], mcpServers: [] },
  stationManager: { skills: [], mcpServers: [] },
  dispatchOm: { skills: [], mcpServers: [] },
  officeAdmin: { skills: [], mcpServers: [] },
  ledgerReport: { skills: [], mcpServers: [] },
  dataAnalysis: { skills: [], mcpServers: [] },
  digitalDev: { skills: [], mcpServers: [] },
  safetyCapital: { skills: [], mcpServers: [] }
}

/**
 * Applies capability presets for the picked professional lines at the end of
 * onboarding. Currently a no-op because every preset is empty; the call site
 * in OnboardingPage is already wired so filling a preset above is the only
 * change needed to activate provisioning.
 */
export async function applyInterestPresets(interestIds: string[]): Promise<void> {
  const presets = interestIds
    .map((id) => INTEREST_CAPABILITY_PRESETS[id])
    .filter((preset): preset is InterestCapabilityPreset => Boolean(preset))
  const hasWork = presets.some(
    (preset) => preset.skills.length > 0 || preset.mcpServers.length > 0
  )
  if (!hasWork) return
  // Provisioning lands together with the first real skill/MCP assets.
}
