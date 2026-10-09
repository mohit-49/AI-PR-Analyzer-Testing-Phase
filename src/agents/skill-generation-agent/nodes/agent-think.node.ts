import { openaiClient, defaultChatModel, agentChatModel  } from '../../../lib/ai-client'
import { getAgentLogger } from '../../core/logger'
import { toOpenAIToolSchema } from '../../core/tool-runner'
import { skillAgentTools } from '../tools'
import { SkillAgentStateType, AgentChatMessage } from '../state'

const log = getAgentLogger('skill-generation-agent')

export async function agentThinkNode(state: SkillAgentStateType): Promise<Partial<SkillAgentStateType>> {
  const nextStep = state.stepCount + 1
  log.info({ repo: state.repoContext.repoFullName, step: nextStep }, 'Agent thinking — deciding next action')

  const response = await openaiClient.chat.completions.create({
    model: agentChatModel,
    messages: state.messages as any,
    tools: toOpenAIToolSchema(skillAgentTools),
    tool_choice: 'auto',
    temperature: 0.2,
    max_tokens: 2000,
  })

  const choice = response.choices[0]
  const tokensUsed = response.usage?.total_tokens ?? 0

  const assistantMessage: AgentChatMessage = {
    role: 'assistant',
    content: choice?.message?.content ?? '',
    tool_calls: choice?.message?.tool_calls as AgentChatMessage['tool_calls'],
  }

  const calledFinish = assistantMessage.tool_calls?.some((tc) => tc.function.name === 'finish_analysis')
  const noToolCalls = !assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0

  return {
    messages: [assistantMessage],
    stepCount: nextStep,
    tokensUsed,
    isDone: Boolean(calledFinish || noToolCalls),
  }
}
