/**
 * Agent System Type Definitions
 *
 * Core types for the AI Agent feature. All agent-related types
 * are ring-fenced here — no modifications to existing type files.
 */

// ─── Agent Types ──────────────────────────────────────────────────────────────

export type AgentTaskType = "reconciliation" | "report" | "form" | "request"

export const AGENT_TASK_TYPES: { value: AgentTaskType; label: string }[] = [
  { value: "reconciliation", label: "Reconciliation" },
  { value: "report", label: "Report" },
  { value: "form", label: "Form" },
  { value: "request", label: "Request" },
]

export type AgentExecutionStatus =
  | "running"
  | "completed"
  | "failed"
  | "needs_review"
  | "cancelled"

export type AgentTriggerType = "manual" | "event"

export type MemoryScope = "entity" | "pattern" | "config"

export type FeedbackType = "correction" | "approval" | "rejection"

// ─── Agent Settings ───────────────────────────────────────────────────────────

export interface AgentSettings {
  customInstructions?: string
  confidenceThreshold?: number // 0.70, 0.85, 0.95
  maxIterations?: number       // Default 10
  notifyOnCompletion?: boolean
  notifyOnReview?: boolean
}

// ─── Tool System ──────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown> // Zod-validated at runtime
  handler: (input: unknown, context: ToolContext) => Promise<ToolResult>
}

export interface ToolContext {
  organizationId: string
  agentDefinitionId: string
  executionId: string
  reconciliationConfigId?: string
  reconciliationRunId?: string
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  tokensUsed?: number
  model?: string
  durationMs?: number
}

// ─── Reasoning Loop ───────────────────────────────────────────────────────────

export interface ReasoningDecision {
  reasoning: string
  action: string
  toolName: string | null
  toolInput: unknown | null
  done: boolean
  needsHuman: boolean
  humanMessage?: string
}

export interface ExecutionStep {
  stepNumber: number
  timestamp: string
  reasoning: string
  action: string
  toolName: string | null
  toolInput: unknown | null
  toolOutput: unknown | null
  status: "completed" | "failed" | "skipped"
  model?: string
  tokensUsed?: number
  durationMs?: number
}

export interface ExecutionOutcome {
  matchRate?: number
  matchedCount?: number
  exceptionCount?: number
  recommended?: number
  flaggedForReview?: number
  variance?: number
  summary?: string
}

// ─── Memory Types ─────────────────────────────────────────────────────────────

export interface MemoryContent {
  description: string
  evidence?: string[]       // Examples / supporting observations
  firstObserved?: string    // ISO date
  lastConfirmed?: string    // ISO date
}

export interface MemoryConditions {
  vendor?: string
  amountRange?: [number, number]
  descContains?: string
  accountNumber?: string
}

export interface RetrievedMemory {
  id: string
  scope: MemoryScope
  entityKey: string | null
  category: string | null
  content: MemoryContent
  conditions: MemoryConditions | null
  confidence: number
  correctCount: number
  totalCount: number
  usageCount: number
  relevanceScore: number // Computed during retrieval
}

// ─── LLM Client ───────────────────────────────────────────────────────────────

export type ModelTier = "reasoning" | "tool" | "distillation"

export interface LLMCallOptions {
  model?: string
  tier?: ModelTier
  maxTokens?: number
  temperature?: number
  responseFormat?: "json" | "text"
}

export interface LLMCallResult {
  content: string
  model: string
  tokensUsed: number
  durationMs: number
  cost: number // Estimated USD
}

// ─── Cost Tracking ────────────────────────────────────────────────────────────

export interface CostBudget {
  maxTokensPerExecution: number
  maxCostPerExecution: number    // USD
  maxCostPerOrgDaily: number     // USD
  currentTokensUsed: number
  currentCostUsed: number
}

// ─── Learning / Feedback ──────────────────────────────────────────────────────

export interface AgentRecommendation {
  exceptionIndex: number
  category: string
  reason: string
  confidence: number
  basedOnMemoryId?: string
  basedOnMemoryType?: string
}

export interface LearningLesson {
  scope: MemoryScope
  entityKey?: string
  category?: string
  content: MemoryContent
  conditions?: MemoryConditions
  isCorrection: boolean // true = human corrected agent's recommendation
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ExecutionMetrics {
  baselineMatchRate: number | null
  agentMatchRate: number | null
  exceptionsTotal: number
  exceptionsRecommended: number
  humanCorrections: number
  memoriesUsed: number
  memoriesCreated: number
  memoriesUpdated: number
  llmCallCount: number
  totalTokensUsed: number
  estimatedCostUsd: number
  executionTimeMs: number
  fallbackUsed: boolean
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface AgentListItem {
  id: string
  name: string
  taskType: AgentTaskType | null
  description: string | null
  configId: string | null
  configName?: string
  isActive: boolean
  lastExecution?: {
    status: string
    completedAt: string | null
    createdAt: string
    outcome: ExecutionOutcome | null
  } | null
  matchRateTrend?: { period: string; rate: number }[]
  createdAt: string
}

export interface AgentExecutionDetail {
  id: string
  status: AgentExecutionStatus
  triggerType: AgentTriggerType
  goal: string
  steps: ExecutionStep[]
  outcome: ExecutionOutcome | null
  promptVersion: string | null
  fallbackUsed: boolean
  fallbackReason: string | null
  llmCallCount: number
  totalTokensUsed: number
  estimatedCostUsd: number | null
  executionTimeMs: number | null
  cancelled: boolean
  completedAt: string | null
  createdAt: string
}
