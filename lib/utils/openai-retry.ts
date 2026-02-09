/**
 * OpenAI retry wrapper with exponential backoff.
 *
 * Retries on transient errors (429, 500, 502, 503, 504, connection errors)
 * but NOT on permanent failures (400, 401, 403).
 */
import OpenAI from "openai"
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions"

interface CallOpenAIOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number
  /** Timeout in milliseconds for each attempt (default: 30000) */
  timeoutMs?: number
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return RETRYABLE_STATUS_CODES.has(error.status)
  }
  // Connection errors, timeouts, etc.
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("socket hang up") ||
      msg.includes("aborted") ||
      msg.includes("network") ||
      msg.includes("fetch failed")
    )
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Call OpenAI chat completions with retry logic and timeout.
 *
 * @example
 * ```typescript
 * const openai = getOpenAIClient()
 * const completion = await callOpenAI(openai, {
 *   model: "gpt-4o-mini",
 *   messages: [{ role: "user", content: "Hello" }],
 * })
 * ```
 */
export async function callOpenAI(
  client: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming,
  options: CallOpenAIOptions = {}
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const { maxRetries = 2, timeoutMs = 30_000, baseDelayMs = 1_000 } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const completion = await client.chat.completions.create(params, {
          signal: controller.signal,
        })
        return completion
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      lastError = error

      // Don't retry on permanent failures
      if (!isRetryableError(error)) {
        throw error
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200
      console.warn(
        `[OpenAI] Attempt ${attempt + 1}/${maxRetries + 1} failed (${
          error instanceof OpenAI.APIError ? `status ${error.status}` : (error as Error).message
        }), retrying in ${Math.round(delay)}ms...`
      )
      await sleep(delay)
    }
  }

  throw lastError
}
