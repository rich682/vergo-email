/**
 * Frontend-specific types for the Automations feature.
 * Re-exports core workflow types and adds UI-specific shapes.
 */

export type {
  TriggerType,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
  ActionType,
  WorkflowRunStatus,
  StepResult,
  TriggerContext,
  TriggerConditions,
  BoardTriggerConditions,
  ScheduledTriggerConditions,
  DataConditionTriggerConditions,
  DataUploadedTriggerConditions,
  FormSubmittedTriggerConditions,
} from "@/lib/workflows/types"

// ─── Template Types ──────────────────────────────────────────────────────────

export interface AutomationTemplate {
  id: string
  name: string
  description: string
  icon: string // Lucide icon name
  triggerType: import("@/lib/workflows/types").TriggerType
  defaultConditions: Record<string, unknown>
  defaultSteps: Partial<import("@/lib/workflows/types").WorkflowStep>[]
  category: "requests" | "reconciliation" | "reports" | "forms" | "analysis"
  requiresDatabase: boolean // Whether this agent type needs database triggers
  allowedTriggers: string[] // Which trigger options to show in the wizard
  recipientSource: "task_history" | "database" | "config" | "none" // Clarifies configuration step
}

// ─── API Response Shapes ─────────────────────────────────────────────────────

export interface AutomationRuleListItem {
  id: string
  name: string
  trigger: string
  conditions: Record<string, unknown>
  actions: Record<string, unknown>
  isActive: boolean
  cronExpression: string | null
  timezone: string | null
  nextRunAt: string | null
  lineageId: string | null
  taskType: string | null
  createdAt: string
  updatedAt: string
  lineage?: { id: string; name: string } | null
  _count: { workflowRuns: number }
  lastRun?: {
    id: string
    status: string
    completedAt: string | null
    createdAt: string
  } | null
}

export interface AutomationRuleDetail extends AutomationRuleListItem {
  createdById: string | null
  actions: import("@/lib/workflows/types").WorkflowDefinition & Record<string, unknown>
}

export interface WorkflowRunListItem {
  id: string
  status: string
  currentStepId: string | null
  stepResults: import("@/lib/workflows/types").StepResult[]
  triggerContext: import("@/lib/workflows/types").TriggerContext
  startedAt: string | null
  completedAt: string | null
  failureReason: string | null
  createdAt: string
  automationRule: {
    id: string
    name: string
    trigger: string
  }
}

export interface WorkflowRunDetail extends WorkflowRunListItem {
  auditLogs: WorkflowAuditLogEntry[]
}

export interface WorkflowAuditLogEntry {
  id: string
  stepId: string | null
  actionType: string
  targetType: string | null
  targetId: string | null
  outcome: string | null
  detail: Record<string, unknown> | null
  actorType: string | null
  actorId: string | null
  createdAt: string
}

// ─── Task Linkage Types ─────────────────────────────────────────────────────

export interface TaskLinkageData {
  taskId: string
  lineageId: string | null
  taskType: string | null
  taskName: string
}

// ─── Cron Builder Types ──────────────────────────────────────────────────────

export interface CronSchedule {
  frequency: "daily" | "weekly" | "monthly"
  dayOfWeek?: number[] // 0-6 (Sun-Sat) for weekly
  dayOfMonth?: number  // 1-28 or -1 for last day, for monthly
  hour: number         // 0-23
  minute: number       // 0, 15, 30, 45
  timezone: string
}
