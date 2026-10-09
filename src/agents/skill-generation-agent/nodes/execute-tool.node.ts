import { getAgentLogger } from '../../core/logger'
import { runTool, describeToolCall } from '../../core/tool-runner'
import { skillAgentTools } from '../tools'
import { SkillAgentStateType, AgentChatMessage } from '../state'

const log = getAgentLogger('skill-generation-agent')

export async function executeToolNode(state: SkillAgentStateType): Promise<Partial<SkillAgentStateType>> {
  const lastMessage = state.messages[state.messages.length - 1]
  const toolCalls = lastMessage?.tool_calls ?? []

  if (toolCalls.length === 0) {
    return {}
  }

  const toolMessages: AgentChatMessage[] = []
  const stepsThisRound: string[] = []

  for (const call of toolCalls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || '{}')
    } catch {
      log.warn({ raw: call.function.arguments }, 'Agent produced non-JSON tool arguments — using empty args')
    }

    const label = describeToolCall(skillAgentTools, call.function.name, args)
    stepsThisRound.push(label)

    if (call.function.name === 'finish_analysis') {
      toolMessages.push({ role: 'tool', tool_call_id: call.id, content: 'Acknowledged — moving to final answer.' })
      continue
    }

    log.info({ repo: state.repoContext.repoFullName, tool: call.function.name, args }, label)
    await state.onProgress?.(label)

    let result: string
    try {
      result = await runTool(skillAgentTools, call.function.name, args, state.repoContext)
    } catch (error) {
      log.warn({ tool: call.function.name, error: (error as Error)?.message }, 'Tool execution failed')
      result = `Tool "${call.function.name}" failed: ${(error as Error)?.message ?? 'unknown error'}`
    }

    toolMessages.push({ role: 'tool', tool_call_id: call.id, content: result })
  }

  return {
    messages: toolMessages,
    agentSteps: stepsThisRound,
  }
}
