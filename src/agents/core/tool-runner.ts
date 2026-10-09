import { AgentTool, AgentRepoContext } from './types'

/** Builds the `tools` array shape Groq's (OpenAI-compatible) chat.completions API expects. */
export function toOpenAIToolSchema(tools: AgentTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.definition.name,
      description: tool.definition.description,
      parameters: tool.definition.parameters,
    },
  }))
}

/** Finds and runs the tool matching a name, returning its text result. Throws if the name is unknown. */
export async function runTool(
  tools: AgentTool[],
  name: string,
  args: Record<string, unknown>,
  ctx: AgentRepoContext
): Promise<string> {
  const tool = tools.find((t) => t.definition.name === name)
  if (!tool) {
    return `Unknown tool "${name}" — no such tool is available.`
  }
  return tool.execute(args, ctx)
}

/** Human-readable progress label for a given tool call — used for live "Reading X..." updates. */
export function describeToolCall(tools: AgentTool[], name: string, args: Record<string, unknown>): string {
  const tool = tools.find((t) => t.definition.name === name)
  if (!tool) return `Running ${name}`
  return tool.describeCall(args)
}
