import { Annotation } from '@langchain/langgraph'
import type { AgentRepoContext, AgentProgressCallback } from '../core/types'
import type { SkillOutput } from '../../services/skill-analyzer.service'

export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export const SkillAgentState = Annotation.Root({
  // ── Fixed context for this run (set once at the start, never changes) ──
  repoContext: Annotation<AgentRepoContext>({
    reducer: (_curr, update) => update,
    default: () => undefined as unknown as AgentRepoContext,
  }),
  onProgress: Annotation<AgentProgressCallback | undefined>({
    reducer: (curr, update) => update ?? curr,
    default: () => undefined,
  }),

  // ── Conversation the agent is building up, one think→act cycle at a time ──
  messages: Annotation<AgentChatMessage[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // ── Loop bookkeeping ──
  stepCount: Annotation<number>({
    reducer: (_curr, update) => update,
    default: () => 0,
  }),
  tokensUsed: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),
  isDone: Annotation<boolean>({
    reducer: (_curr, update) => update,
    default: () => false,
  }),
  agentSteps: Annotation<string[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // ── Result ──
  finalOutput: Annotation<SkillOutput | null>({
    reducer: (_curr, update) => update,
    default: () => null,
  }),


  promptTokens: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),

  completionTokens: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),


})

export type SkillAgentStateType = typeof SkillAgentState.State
