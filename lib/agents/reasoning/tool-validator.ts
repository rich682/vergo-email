/**
 * Tool Validator
 *
 * Validates LLM reasoning decisions against registered tool schemas.
 * Retry once on validation failure with error correction prompt.
 */

import { z } from "zod"
import type { ReasoningDecision } from "../types"

// Schema for the LLM reasoning decision response
export const reasoningDecisionSchema = z.object({
  reasoning: z.string(),
  action: z.string(),
  toolName: z.string().nullable(),
  toolInput: z.unknown().nullable(),
  done: z.boolean(),
  needsHuman: z.boolean(),
  humanMessage: z.string().optional(),
})

// Per-tool input schemas
const toolInputSchemas: Record<string, z.ZodType> = {
  run_deterministic_matching: z.object({
    reconciliationRunId: z.string(),
  }),
  run_fuzzy_matching: z.object({
    reconciliationRunId: z.string(),
    unmatchedOnly: z.boolean().optional(),
  }),
  classify_exceptions: z.object({
    reconciliationRunId: z.string(),
    exceptionIndices: z.array(z.number()).optional(),
  }),
  recommend_resolution: z.object({
    exceptionIndex: z.number(),
    category: z.string(),
    reason: z.string(),
    confidence: z.number(),
  }),
  check_entity_memory: z.object({
    entityKey: z.string(),
  }),
  check_vendor_database: z.object({
    query: z.string(),
  }),
  check_database: z.object({
    databaseSourceType: z.string(),
    query: z.record(z.string(), z.unknown()),
  }),
  flag_for_human_review: z.object({
    exceptionIndices: z.array(z.number()),
    reason: z.string(),
  }),
  generate_summary: z.object({
    includeRecommendations: z.boolean().optional(),
  }),
  save_results: z.object({
    reconciliationRunId: z.string(),
  }),
}

/**
 * Validate a reasoning decision from the LLM.
 * Returns the validated decision or throws with details.
 */
export function validateDecision(raw: unknown): ReasoningDecision {
  const parsed = reasoningDecisionSchema.parse(raw)

  // If a tool is specified, validate its input
  if (parsed.toolName && parsed.toolInput) {
    const inputSchema = toolInputSchemas[parsed.toolName]
    if (inputSchema) {
      inputSchema.parse(parsed.toolInput)
    }
    // Unknown tools pass through — they'll fail at execution
  }

  return parsed as ReasoningDecision
}

/**
 * Build an error correction prompt when validation fails.
 */
export function buildCorrectionPrompt(error: unknown): string {
  const message = error instanceof z.ZodError
    ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
    : String(error)

  return `Your previous response had a validation error: ${message}

Please respond again with valid JSON matching this schema:
{
  "reasoning": "string - your step-by-step thinking",
  "action": "string - what you decided to do",
  "toolName": "string|null - tool to call (or null if done)",
  "toolInput": "object|null - input for the tool",
  "done": "boolean - true if finished",
  "needsHuman": "boolean - true if human review needed",
  "humanMessage": "string (optional) - message for human if needsHuman"
}`
}
