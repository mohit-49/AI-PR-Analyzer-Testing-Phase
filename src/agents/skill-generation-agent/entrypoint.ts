import { AppError } from '../../lib/errors'
import { defaultChatModel } from '../../lib/ai-client'
import { AGENT_SAFETY } from '../core/safety.config'
import { AgentRepoContext, AgentProgressCallback } from '../core/types'
import { getAgentLogger } from '../core/logger'
import { buildSkillGenerationAgentGraph } from './graph'
import { buildAgentSystemPrompt } from './prompts'
import { SkillOutput } from '../../services/skill-analyzer.service'
import { agentChatModel } from '../../lib/ai-client'

const log = getAgentLogger('skill-generation-agent')

export interface RunSkillGenerationAgentParams {
  repoContext: AgentRepoContext
  onProgress?: AgentProgressCallback
}

export interface RunSkillGenerationAgentResult {
  output: SkillOutput
  tokensUsed: number
  aiModel: string
  agentSteps: string[]
  stepsTaken: number
  promptTokens: number
  completionTokens: number
}

const compiledGraph = buildSkillGenerationAgentGraph()

export async function runSkillGenerationAgent(
  params: RunSkillGenerationAgentParams
): Promise<RunSkillGenerationAgentResult> {
  const { repoContext, onProgress } = params

  log.info({ repo: repoContext.repoFullName }, 'Starting skill-generation agent run')

  const initialState = {
    repoContext,
    onProgress,
    messages: [
      { role: 'system' as const, content: buildAgentSystemPrompt(repoContext.repoFullName) },
      { role: 'user' as const, content: `Begin exploring "${repoContext.repoFullName}" now.` },
    ],
  }

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new AppError('Agent run exceeded the time limit', 504, 'AGENT_TIMEOUT')), AGENT_SAFETY.TIMEOUT_MS)
  })

  const finalState = await Promise.race([compiledGraph.invoke(initialState), timeout])

  if (!finalState.finalOutput) {
    throw new AppError('Agent finished without producing a final answer', 500, 'AGENT_NO_OUTPUT')
  }

  log.info(
    { repo: repoContext.repoFullName, steps: finalState.stepCount, tokensUsed: finalState.tokensUsed },
    'Skill-generation agent run completed'
  )

  return {
    output: finalState.finalOutput,
    tokensUsed: finalState.tokensUsed,
    // aiModel: `${defaultChatModel} (agent)`,
    aiModel: `${agentChatModel} (agent)`,
    agentSteps: finalState.agentSteps,
    stepsTaken: finalState.stepCount,
    promptTokens: finalState.promptTokens,
    completionTokens: finalState.completionTokens,

  }
}
