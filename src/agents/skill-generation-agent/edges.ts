import { AGENT_SAFETY } from '../core/safety.config'
import { SkillAgentStateType } from './state'

export function shouldContinue(state: SkillAgentStateType): 'agentThink' | 'generateFinalAnswer' {
  if (state.isDone) return 'generateFinalAnswer'
  if (state.stepCount >= AGENT_SAFETY.MAX_STEPS) return 'generateFinalAnswer'
  if (state.tokensUsed >= AGENT_SAFETY.MAX_TOKEN_BUDGET) return 'generateFinalAnswer'
  return 'agentThink'
}
