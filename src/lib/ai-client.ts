import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env'
import { LLMFactory } from './llm/llm-factory'
import { LLMConfig } from './llm/llm-config'

export const openaiClient = LLMFactory.getProvider()

export const defaultChatModel = LLMConfig.getConfig(env.LLM_FAMILY).defaultModel

export const agentChatModel =  env.LLM_FAMILY === 'ollama' && env.OLLAMA_AGENT_MODEL ? env.OLLAMA_AGENT_MODEL : defaultChatModel

export const anthropicClient = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null
