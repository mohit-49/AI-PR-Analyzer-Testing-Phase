import OpenAI from 'openai'
import { env } from '../../../config/env'
import { LLMConfig } from '../llm-config'
import { LLMProvider, LLMChatParams, LLMChatResult } from '../types'

export function createGroqProvider(): LLMProvider {
  const config = LLMConfig.getConfig('groq')
  const client = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: config.baseUrl })

  return {
    chat: {
      completions: {
        create: async (params: LLMChatParams): Promise<LLMChatResult> => {
          const response = await client.chat.completions.create(params as any)
          return response as unknown as LLMChatResult
        },
      },
    },
  }
}
