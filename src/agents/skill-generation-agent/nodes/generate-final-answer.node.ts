import { openaiClient, agentChatModel } from '../../../lib/ai-client'
import { AppError } from '../../../lib/errors'
import { getAgentLogger } from '../../core/logger'
import { retryWithBackoff } from '../../../utils/retry.util'
import { SkillOutputSchema } from '../../../services/skill-analyzer.service'
import { buildFinalAnswerPrompt } from '../prompts'
import { SkillAgentStateType, AgentChatMessage } from '../state'

const log = getAgentLogger('skill-generation-agent')

function buildExplorationTranscript(messages: AgentChatMessage[]): string {
  const lines: string[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        if (call.function.name === 'finish_analysis') continue
        lines.push(`> Explored: ${call.function.name}(${call.function.arguments})`)
      }
    } else if (msg.role === 'tool') {
      lines.push(msg.content)
    } else if (msg.role === 'assistant' && msg.content) {
      lines.push(`Note: ${msg.content}`)
    }
  }
  return lines.join('\n')
}

export async function generateFinalAnswerNode(state: SkillAgentStateType): Promise<Partial<SkillAgentStateType>> {
  log.info({ repo: state.repoContext.repoFullName, totalSteps: state.stepCount }, 'Generating final structured answer')

  const transcript = buildExplorationTranscript(state.messages)
  const finalMessages: AgentChatMessage[] = [
    {
      role: 'system',
      content: `You are finalizing a repository analysis for "${state.repoContext.repoFullName}" based on the exploration notes below. Do not call any tools — respond only with the final JSON described.`,
    },
    {
      role: 'user',
      content: `Exploration notes:\n${transcript || '(no notes recorded)'}\n\n${buildFinalAnswerPrompt()}`,
    },
  ]
  let lastTokensUsed = 0
  let lastPromptTokens = 0
  let lastCompletionTokens = 0

  const validated = await retryWithBackoff(
    async () => {
      const response = await openaiClient.chat.completions.create({
        model: agentChatModel,
        messages: finalMessages,
        temperature: 0.2,
        max_tokens: 16000,
      })

      const raw = response.choices[0]?.message?.content
      lastTokensUsed = response.usage?.total_tokens ?? 0
      lastPromptTokens += response.usage?.prompt_tokens ?? 0
      lastCompletionTokens += response.usage?.completion_tokens ?? 0

      if (!raw) {
        log.warn({ repo: state.repoContext.repoFullName }, 'Agent final answer came back empty — retrying this call')
        throw new AppError('Agent returned an empty final answer', 500, 'AGENT_EMPTY_ANSWER')
      }

      const cleaned = raw.replace(/```json|```/g, '').trim()
      let parsed: unknown
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        log.warn({ raw }, 'Agent final answer was not valid JSON — retrying this call')
        throw new AppError('Agent returned invalid JSON for the final answer', 500, 'AGENT_PARSE_ERROR')
      }

      const result = SkillOutputSchema.safeParse(parsed)
      if (!result.success) {
        log.warn({ errors: result.error.flatten() }, 'Agent final answer failed Zod validation — retrying this call')
        throw new AppError('Agent final answer failed validation', 500, 'AGENT_VALIDATION_ERROR')
      }

      return result.data
    },
    { attempts: 4, initialDelayMs: 2000, label: 'Agent final answer' }
  )

  return {
    finalOutput: validated,
    tokensUsed: lastTokensUsed,
    promptTokens: lastPromptTokens,
    completionTokens: lastCompletionTokens,
  }
}