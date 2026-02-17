/**
 * Workflow Automation Type Definitions
 *
 * Types for the workflow engine that sits above the AI Agent system.
 * Workflows orchestrate sequences of actions (send_request, send_form,
 * complete_reconciliation, complete_report, agent_run) with optional
 * conditionals and human approval gates.
 */

// ─── Trigger Types ───────────────────────────────────────────────────────────

export type TriggerType =
  | "board_created"
  | "board_status_changed"
  | "scheduled"
  | "data_condition"
  | "data_uploaded"
  | "form_submitted"

/** Conditions for board_created / board_status_changed triggers */
export interface BoardTriggerConditions {
  configId?: string
  lineageId?: string
  boardCadence?: string
  targetStatus?: string // For board_status_changed: "COMPLETE" | "IN_PROGRESS" etc.
}

/** Conditions for scheduled triggers */
export interface ScheduledTriggerConditions {
  cronExpression: string
  timezone: string
}

/** Conditions for data_condition triggers */
export interface DataConditionTriggerConditions {
  databaseId: string
  columnKey: string
  operator: "between" | "eq" | "gt" | "lt" | "gte" | "lte" | "contains"
  value: unknown // e.g. ["{{board.periodStart}}", "{{board.periodEnd}}"] for between
  boardScope?: string // "current_period" — resolves template vars from active board
}

/** Conditions for data_uploaded triggers */
export interface DataUploadedTriggerConditions {
  configId?: string // Reconciliation config filter
}

/** Conditions for form_submitted triggers */
export interface FormSubmittedTriggerConditions {
  formDefinitionId?: string
  taskInstanceId?: string
}

export type TriggerConditions =
  | BoardTriggerConditions
  | ScheduledTriggerConditions
  | DataConditionTriggerConditions
  | DataUploadedTriggerConditions
  | FormSubmittedTriggerConditions

// ─── Workflow Definition ─────────────────────────────────────────────────────

export interface WorkflowDefinition {
  version: 1
  steps: WorkflowStep[]
}

export type WorkflowStepType = "action" | "condition" | "human_approval" | "agent_run"

export type ActionType =
  | "send_request"
  | "send_form"
  | "complete_reconciliation"
  | "complete_report"

export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  label: string

  // type = "action"
  actionType?: ActionType
  actionParams?: Record<string, unknown>

  // type = "condition"
  condition?: {
    field: string // Dot-notation: "steps.<stepId>.<field>" or "trigger.<field>"
    operator: "gt" | "lt" | "eq" | "gte" | "lte"
    value: unknown
  }
  onTrue?: string  // Step ID to jump to
  onFalse?: string // Step ID to jump to

  // type = "human_approval"
  approvalMessage?: string
  notifyUserIds?: string[]
  timeoutHours?: number // Auto-cancel after timeout

  // type = "agent_run"
  agentDefinitionId?: string

  // General
  nextStepId?: string // Default next step (linear flow)
  onError?: "skip" | "fail" | "retry"
}

// ─── Workflow Run ────────────────────────────────────────────────────────────

export type WorkflowRunStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"

export interface StepResult {
  stepId: string
  stepLabel: string
  type: WorkflowStepType
  outcome: "success" | "failed" | "skipped"
  data?: Record<string, unknown> // Action output, condition evaluation, etc.
  error?: string
  completedAt: string // ISO timestamp
}

// ─── Trigger Context ─────────────────────────────────────────────────────────

export interface TriggerContext {
  triggerType: TriggerType
  triggerEventId: string // Board ID, run ID, form request ID, scheduled time, etc.
  organizationId: string
  metadata: Record<string, unknown> // Additional context from the trigger event
}

// ─── Workflow Trigger Event (Inngest) ────────────────────────────────────────

export interface WorkflowTriggerEventData {
  triggerType: TriggerType
  triggerEventId: string
  organizationId: string
  metadata: Record<string, unknown>
}

export interface WorkflowRunEventData {
  automationRuleId: string
  workflowRunId: string
  organizationId: string
  triggerContext: TriggerContext
}

export interface WorkflowApprovedEventData {
  workflowRunId: string
  stepId: string
  approvedBy: string
  decision: "approved" | "rejected"
}

// ─── Action Handler Context ──────────────────────────────────────────────────

export interface ActionContext {
  organizationId: string
  workflowRunId: string
  triggeredBy: string | null // userId or null for system
  triggerContext: TriggerContext
  stepResults: StepResult[] // Results from previous steps
}

// ─── Send Request Action Params ──────────────────────────────────────────

export type RecipientSourceType =
  | "contact_types"
  | "groups"
  | "specific_contacts"
  | "specific_users"
  | "database"

export interface SendRequestDatabaseFilter {
  columnKey: string
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_empty" | "is_empty"
  value?: string | number | boolean
}

export interface SendRequestActionParams {
  // Content (pick one)
  requestTemplateId?: string
  questId?: string // Legacy backward compat

  // Recipients
  recipientSourceType?: RecipientSourceType
  contactTypes?: string[]
  groupIds?: string[]
  entityIds?: string[]
  userIds?: string[]
  databaseId?: string
  emailColumnKey?: string
  nameColumnKey?: string
  filters?: SendRequestDatabaseFilter[]

  // Schedule (optional)
  deadlineDate?: string
  remindersConfig?: {
    enabled: boolean
    frequency: "daily" | "weekly" | "biweekly"
    stopCondition: "reply" | "deadline" | "reply_or_deadline"
  }
}

// ─── Audit Log Types ─────────────────────────────────────────────────────────

export type AuditActionType =
  | "action_executed"
  | "condition_evaluated"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "approval_timeout"
  | "step_failed"
  | "step_skipped"
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled"

export type AuditTargetType =
  | "reconciliation_run"
  | "quest"
  | "form_request"
  | "report"
  | "agent_execution"
