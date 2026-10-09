import { env } from '../../config/env'
import { LLMProvider } from './types'
import { createGroqProvider } from './providers/groq.provider'
import { createOllamaProvider } from './providers/ollama.provider'

const providers: Record<string, () => LLMProvider> = {
  groq: createGroqProvider,
  ollama: createOllamaProvider,
}

export const LLMFactory = {
  getProvider(): LLMProvider {
    const family = env.LLM_FAMILY.toLowerCase()
    const factory = providers[family]
    if (!factory) {
      throw new Error(`Unsupported LLM family: ${family}`)
    }
    return factory()
  },
}
