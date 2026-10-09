import { logger } from '../lib/logger'

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; initialDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { attempts = 3, initialDelayMs = 5000, label = 'operation' } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === attempts

      if (isLastAttempt) break

      const delay = initialDelayMs * Math.pow(2, attempt - 1) // 5s, 10s, 20s...
      logger.warn(
        { attempt, attempts, delayMs: delay, error: (error as Error)?.message },
        `${label} failed, retrying...`
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
