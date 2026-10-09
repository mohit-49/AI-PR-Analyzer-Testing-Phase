export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export interface LLMToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMChatParams {
  model: string
  messages: LLMMessage[]
  temperature?: number
  max_tokens?: number
  tools?: LLMToolDefinition[]
  tool_choice?: 'auto' | 'none'
}

export interface LLMChatResult {
  choices: [
    {
      message: {
        content: string | null
        tool_calls?: LLMMessage['tool_calls']
      }
    },
  ]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface LLMProvider {
  chat: {
    completions: {
      create: (params: LLMChatParams) => Promise<LLMChatResult>
    }
  }
}
