/**
 * Agent Reasoning Service
 *
 * Core LLM reasoning loop: think → act → observe → repeat.
 * Decides which tool to use next based on goal, state, and memory.
 */

import { callAgentLLM } from "../llm-client"
import { validateDecision, buildCorrectionPrompt } from "./tool-validator"
import { getToolDescriptions } from "./tool-executor"
import { formatMemoriesForPrompt } from "../memory/memory-formatter"
import { getDataBudget, estimateTokens } from "../context-budget"
import type { ReasoningDecision, RetrievedMemory, ExecutionStep } from "../types"

interface ReasoningInput {
  systemPrompt: string
  goal: string
  currentState: string       // JSON summary of current match state
  memories: RetrievedMemory[]
  previousSteps: ExecutionStep[]
  iteration: number
  totalRows: number
  customInstructions?: string
}

/**
 * Make a single reasoning decision using the LLM.
 * Validates output with Zod schema, retries once on failure.
 */
export async function makeReasoningDecision(input: ReasoningInput): Promise<{
  decision: ReasoningDecision
  tokensUsed: number
  model: string
  durationMs: number
  cost: number
}> {
  const {
    systemPrompt,
    goal,
    currentState,
    memories,
    previousSteps,
    iteration,
    totalRows,
    customInstructions,
  } = input

  const budget = getDataBudget(iteration, totalRows)

  // Build system message
  const toolsSection = getToolDescriptions()
  const memoriesSection = formatMemoriesForPrompt(memories)
  const historySection = previousSteps
    .slice(-budget.maxHistorySteps)
    .map(s => `Step ${s.stepNumber} [${s.status}]: ${s.action}${s.toolOutput ? ` → Result: ${JSON.stringify(s.toolOutput).substring(0, 200)}` : ""}`)
    .join("\n")

  const fullSystemPrompt = [
    systemPrompt,
    "",
    "## Available Tools",
    toolsSection,
    "",
    "## Your Memory",
    memoriesSection,
    "",
    customInstructions ? `## Custom Instructions\n${customInstructions}\n` : "",
    "## Rules",
    "- NEVER auto-resolve exceptions. Only RECOMMEND resolutions.",
    "- Always explain your reasoning clearly.",
    "- Be conservative — flag uncertain items for human review.",
    "- If you've tried a tool twice with the same args, use a different approach or finish.",
    "",
    "Respond with JSON: { reasoning, action, toolName, toolInput, done, needsHuman, humanMessage? }",
  ].filter(Boolean).join("\n")

  const userMessage = [
    `## Goal\n${goal}`,
    "",
    `## Iteration ${iteration}/10`,
    "",
    `## Current State\n${currentState}`,
    "",
    historySection ? `## Previous Steps\n${historySection}` : "",
    "",
    "What should we do next? Respond with your reasoning and the next tool to call (or set done=true if finished).",
  ].filter(Boolean).join("\n")

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: fullSystemPrompt },
    { role: "user", content: userMessage },
  ]

  // First attempt
  const result = await callAgentLLM(messages, {
    tier: "reasoning",
    responseFormat: "json",
    maxTokens: 1500,
  })

  try {
    const parsed = JSON.parse(result.content)
    const decision = validateDecision(parsed)
    return {
      decision,
      tokensUsed: result.tokensUsed,
      model: result.model,
      durationMs: result.durationMs,
      cost: result.cost,
    }
  } catch (validationError) {
    // Retry once with error correction
    console.warn("[Agent Reasoning] Validation failed, retrying with correction prompt")
    const correctionPrompt = buildCorrectionPrompt(validationError)

    const retryMessages = [
      ...messages,
      { role: "assistant" as const, content: result.content },
      { role: "user" as const, content: correctionPrompt },
    ]

    const retryResult = await callAgentLLM(retryMessages, {
      tier: "reasoning",
      responseFormat: "json",
      maxTokens: 1500,
    })

    const retryParsed = JSON.parse(retryResult.content)
    const decision = validateDecision(retryParsed)

    return {
      decision,
      tokensUsed: result.tokensUsed + retryResult.tokensUsed,
      model: retryResult.model,
      durationMs: result.durationMs + retryResult.durationMs,
      cost: result.cost + retryResult.cost,
    }
  }
}
