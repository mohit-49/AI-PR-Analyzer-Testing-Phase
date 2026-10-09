import { env } from '../../config/env'

export interface LLMConfigShape {
  baseUrl?: string
  defaultModel: string
  embeddingModel?: string
}

export const LLMConfig = {
  getConfig(llmFamily: string): LLMConfigShape {
    switch (llmFamily.toLowerCase()) {
      case 'ollama':
        return {
          baseUrl: env.OLLAMA_BASE_URL,
          defaultModel: env.OLLAMA_MODEL ?? 'llama3.1:8b',
          embeddingModel: env.OLLAMA_EMBEDDING_MODEL,
        }
      case 'groq':
      default:
        return {
          baseUrl: 'https://api.groq.com/openai/v1',
          defaultModel: 'openai/gpt-oss-20b',
        }
    }
  },
}
