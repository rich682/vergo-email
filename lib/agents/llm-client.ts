/**
 * Agent LLM Client
 *
 * Model selection + cascade fallback logic for agent LLM calls.
 * Uses existing callOpenAI() wrapper for retry/timeout handling.
 */

import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import type { ModelTier, LLMCallOptions, LLMCallResult } from "./types"

// Model configuration per tier
const MODEL_MAP: Record<ModelTier, string> = {
  reasoning: "gpt-4o",           // Multi-step reasoning, tool selection
  tool: "gpt-4o-mini",           // Individual tool calls, classification
  distillation: "gpt-4o-mini",   // Memory summarization, lesson extraction
}

// Cost per 1K tokens (approximate, for budget tracking)
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
}

/**
 * Call the LLM with automatic model selection and fallback cascade.
 *
 * Cascade: gpt-4o → gpt-4o-mini (if reasoning tier fails)
 */
export async function callAgentLLM(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: LLMCallOptions = {}
): Promise<LLMCallResult> {
  const tier = options.tier || "reasoning"
  const model = options.model || MODEL_MAP[tier]
  const maxTokens = options.maxTokens || 2000
  const temperature = options.temperature ?? 0.3

  const client = getOpenAIClient()
  const startTime = Date.now()

  try {
    const completion = await callOpenAI(client, {
      model,
      messages,
      ...(options.responseFormat === "json" ? { response_format: { type: "json_object" as const } } : {}),
      max_tokens: maxTokens,
      temperature,
    })

    const durationMs = Date.now() - startTime
    const content = completion.choices[0]?.message?.content || ""
    const tokensUsed = completion.usage?.total_tokens || estimateTokens(messages, content)
    const cost = estimateCost(model, tokensUsed)

    return { content, model, tokensUsed, durationMs, cost }
  } catch (error) {
    // Cascade fallback: if reasoning model fails, try tool model
    if (tier === "reasoning" && model !== "gpt-4o-mini") {
      console.warn(`[Agent LLM] ${model} failed, falling back to gpt-4o-mini:`, (error as Error).message)
      const fallbackModel = "gpt-4o-mini"
      const startFallback = Date.now()

      const completion = await callOpenAI(client, {
        model: fallbackModel,
        messages,
        ...(options.responseFormat === "json" ? { response_format: { type: "json_object" as const } } : {}),
        max_tokens: maxTokens,
        temperature,
      })

      const durationMs = Date.now() - startFallback
      const content = completion.choices[0]?.message?.content || ""
      const tokensUsed = completion.usage?.total_tokens || estimateTokens(messages, content)
      const cost = estimateCost(fallbackModel, tokensUsed)

      return { content, model: fallbackModel, tokensUsed, durationMs, cost }
    }

    throw error
  }
}

function estimateTokens(
  messages: Array<{ role: string; content: string }>,
  output: string
): number {
  // Rough estimate: ~4 chars per token
  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  return Math.ceil((inputChars + output.length) / 4)
}

function estimateCost(model: string, totalTokens: number): number {
  const rates = COST_PER_1K[model] || COST_PER_1K["gpt-4o-mini"]
  // Assume 60/40 split input/output
  const inputTokens = totalTokens * 0.6
  const outputTokens = totalTokens * 0.4
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output
}
