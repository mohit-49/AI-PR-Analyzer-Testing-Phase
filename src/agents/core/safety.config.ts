export const AGENT_SAFETY = {
  /** Max number of think→act loop iterations before we force a stop. */
  MAX_STEPS: 8,

  /** Wall-clock budget for the entire agent run (all steps combined).  5 min */
  TIMEOUT_MS: 300_000,

  /** Hard cap on how much text a single tool result can contribute to the conversation. */
  MAX_TOOL_RESULT_CHARS: 2000,

  /** Hard cap on entries returned by a single list_directory / search_files call. */
  MAX_LISTING_ENTRIES: 60,

  /** Token budget guardrail — if cumulative usage crosses this, we stop looping early. */
  MAX_TOKEN_BUDGET: 40_000,
} as const
