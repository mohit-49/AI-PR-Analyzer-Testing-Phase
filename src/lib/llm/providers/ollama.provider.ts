import { LLMConfig } from '../llm-config'
import { LLMProvider, LLMChatParams, LLMChatResult } from '../types'
import { retryWithBackoff } from '../../../utils/retry.util'
import { logger } from '../../logger'
import { env } from '@/config/env'

const log = logger.child({ module: 'llm', provider: 'ollama' })

interface OllamaChatResponse {
    message?: {
        content?: string
        tool_calls?: LLMChatResult['choices'][0]['message']['tool_calls']
    }
    prompt_eval_count?: number
    eval_count?: number
}

export function createOllamaProvider(): LLMProvider {
    const config = LLMConfig.getConfig('ollama')

    if (!config.baseUrl) {
        throw new Error('OLLAMA_BASE_URL is not set — cannot create the Ollama provider')
    }

    const baseUrl = config.baseUrl.replace(/\/$/, '')

    return {
        chat: {
            completions: {
                create: async (params: LLMChatParams): Promise<LLMChatResult> => {
                    const model = params.model || config.defaultModel

                    const body = {
                        model,
                        messages: params.messages,
                        stream: false,
                        options: {
                            temperature: params.temperature ?? 0.2,
                            num_ctx: env.OLLAMA_NUM_CTX,
                            ...(params.max_tokens ? { num_predict: params.max_tokens } : {}),
                        },
                        ...(params.tools ? { tools: params.tools } : {}),
                    }

                    log.info({ model, baseUrl }, 'Calling Ollama /api/chat')

                    const data = await retryWithBackoff<OllamaChatResponse>(
                        async () => {
                            const res = await fetch(`${baseUrl}/api/chat`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body),
                            })
                            if (!res.ok) {
                                const text = await res.text().catch(() => '')
                                throw new Error(`Ollama request failed (${res.status}): ${text || res.statusText}`)
                            }
                            return (await res.json()) as OllamaChatResponse
                        },
                        { attempts: 3, initialDelayMs: 2000, label: `Ollama chat (${model})` }
                    )

                    const promptTokens = data.prompt_eval_count ?? 0
                    const completionTokens = data.eval_count ?? 0

                    return {
                        choices: [
                            {
                                message: {
                                    content: data.message?.content ?? '',
                                    tool_calls: data.message?.tool_calls,
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: promptTokens,
                            completion_tokens: completionTokens,
                            total_tokens: promptTokens + completionTokens,
                        },
                    }
                },
            },
        },
    }
}
