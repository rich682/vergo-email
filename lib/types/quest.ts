/**
 * Quest System Types
 * 
 * Quest is a semantic wrapper around EmailDraft that provides:
 * - AI-native prompt-first creation flow
 * - Structured interpretation with user confirmation
 * - Support for one-time and standing (recurring) quests
 * 
 * This abstraction allows future migration to a dedicated Quest table
 * without rewriting business logic.
 */

import type { RecipientFilter, RecipientSelection } from "@/lib/services/recipient-filter.service"

// ============================================================================
// Interpretation Types (Phase 2)
// ============================================================================

/**
 * Input for the Quest interpretation endpoint
 */
export type QuestInterpretRequest = {
  prompt: string
  // Organization context is derived from session
}

/**
 * Recipient selection using semantic labels (no entity IDs)
 * LLM outputs these labels, server resolves to actual entities
 */
export type QuestRecipientSelection = {
  contactTypes?: string[]      // e.g., ["EMPLOYEE"] - maps to ContactType enum
  groupNames?: string[]        // e.g., ["NY Office"] - resolved by server to groupIds
  stateFilter?: {
    stateKeys: string[]        // e.g., ["unpaid_invoices"]
    mode: "has" | "missing"
  }
}

/**
 * Schedule intent from LLM interpretation
 */
export type QuestScheduleIntent = {
  sendTiming: "immediate" | "scheduled"
  scheduledDate?: string       // ISO date if scheduled
  deadline?: string            // ISO date (e.g., "end of week" → Friday's date)
}

/**
 * Reminder configuration (uses existing ReminderStateService)
 */
export type QuestReminderIntent = {
  enabled: boolean
  frequency?: "daily" | "weekly" | "biweekly"
  dayOfWeek?: number           // 0-6 for weekly (0 = Sunday, 3 = Wednesday)
  stopCondition: "reply" | "deadline" | "reply_or_deadline"
}

/**
 * Confidence level for AI interpretation
 * - high: Exact match to known type/group names → auto-populate fields
 * - medium: Fuzzy match or inference → show confirmation card
 * - low: Ambiguous or no match → show warning, require manual selection
 */
export type QuestConfidence = "high" | "medium" | "low"

/**
 * Human-readable explanation of interpretation (for UI confirmation card)
 */
export type QuestInterpretationSummary = {
  audienceDescription: string   // "All employees" or "Vendors in NY Office"
  scheduleDescription: string   // "Send immediately, due by Jan 31"
  reminderDescription?: string  // "Reminders every Wednesday until deadline or reply"
  assumptions: string[]         // ["Interpreted 'employees' as type EMPLOYEE"]
}

/**
 * Validation warning from interpretation
 */
export type QuestWarning = {
  type: "empty_audience" | "missing_data" | "ambiguous_term" | "no_matching_type"
  message: string
  suggestion?: string           // e.g., "Did you mean 'CONTRACTOR' instead of 'contractors'?"
}

/**
 * Resolved counts after server validates against actual data
 */
export type QuestResolvedCounts = {
  matchingRecipients: number    // How many contacts match the criteria
  excludedCount: number         // How many excluded (missing email, etc.)
  estimatedReminders?: number   // Calculated based on deadline and frequency
}

/**
 * Full result from the interpretation endpoint
 */
export type QuestInterpretationResult = {
  // Structured recipient selection (semantic labels only, NO entity IDs)
  recipientSelection: QuestRecipientSelection
  
  // Schedule intent
  scheduleIntent: QuestScheduleIntent
  
  // Reminder configuration
  reminderIntent: QuestReminderIntent
  
  // Confidence gating
  confidence: QuestConfidence
  
  // Human-readable explanation
  interpretationSummary: QuestInterpretationSummary
  
  // Validation warnings
  warnings: QuestWarning[]
  
  // Resolved counts
  resolvedCounts: QuestResolvedCounts
}

// ============================================================================
// Interpretation Snapshot (for audit/debugging and future training)
// ============================================================================

/**
 * Snapshot of interpretation for audit trail and future per-user training
 */
export type InterpretationSnapshot = {
  prompt: string
  interpretedSelection: QuestRecipientSelection
  interpretedSchedule: QuestScheduleIntent
  interpretedReminders: QuestReminderIntent
  confidence: QuestConfidence
  assumptions: string[]
  userConfirmed: boolean          // Did user confirm without changes?
  userModifications?: {           // What did user change? (for future training)
    originalType?: string[]
    finalType?: string[]
    originalGroup?: string[]
    finalGroup?: string[]
    originalDeadline?: string
    finalDeadline?: string
    originalReminderFrequency?: string
    finalReminderFrequency?: string
  }
  timestamp: string
}

// ============================================================================
// Quest Entity Types (Phase 3)
// ============================================================================

/**
 * Quest type - one-time or standing (recurring)
 */
export type QuestType = "one_time" | "standing"

/**
 * Quest status lifecycle
 */
export type QuestStatus = 
  | "interpreting"        // LLM is processing the prompt
  | "pending_confirmation" // Waiting for user to confirm interpretation
  | "generating"          // Generating email content
  | "ready"               // Ready to send, preview available
  | "executing"           // Currently sending emails
  | "completed"           // All emails sent successfully
  | "failed"              // Execution failed

/**
 * User-confirmed selection (may differ from initial interpretation)
 * This is what actually gets executed
 */
export type QuestConfirmedSelection = {
  contactTypes?: string[]
  groupIds?: string[]           // Resolved from groupNames by server
  stateFilter?: RecipientFilter
}

/**
 * Schedule configuration (user-confirmed)
 */
export type QuestScheduleConfig = {
  type: "immediate" | "deadline" | "recurring"
  deadline?: Date
  recurrence?: StandingQuestSchedule
}

/**
 * Main Quest entity - semantic wrapper around EmailDraft
 */
export type Quest = {
  id: string
  organizationId: string
  userId: string
  
  // Quest-specific fields
  questType: QuestType
  status: QuestStatus
  
  // Interpretation data
  originalPrompt: string
  interpretationSnapshot?: InterpretationSnapshot
  
  // User-confirmed selection (may differ from initial interpretation)
  confirmedSelection: QuestConfirmedSelection
  
  // Schedule (user-confirmed)
  scheduleConfig?: QuestScheduleConfig
  
  // Reminder configuration (user-confirmed)
  remindersConfig?: {
    enabled: boolean
    startDelayHours: number
    frequencyHours: number
    maxCount: number
    stopCondition: "reply" | "deadline" | "reply_or_deadline"
  }
  
  // Email content (generated after confirmation)
  subject?: string
  body?: string
  htmlBody?: string
  subjectTemplate?: string
  bodyTemplate?: string
  
  // Underlying EmailDraft ID (for persistence)
  emailDraftId?: string
  
  // Audit timestamps
  createdAt: Date
  updatedAt: Date
  confirmedAt?: Date              // When user confirmed interpretation
  executedAt?: Date
}

// ============================================================================
// Standing Quest Types (Phase 4)
// ============================================================================

/**
 * Schedule configuration for standing (recurring) quests
 */
export type StandingQuestSchedule = {
  frequency: "daily" | "weekly" | "monthly"
  dayOfWeek?: number           // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number          // 1-31 for monthly
  timeOfDay: string            // "09:00" (24h format)
  timezone: string             // "America/New_York"
  stopOnReply: boolean         // Stop sending to recipients who reply
}

/**
 * Metadata stored in EmailDraft JSON columns for standing quests
 */
export type StandingQuestMetadata = {
  questType: "standing"
  scheduleConfig: StandingQuestSchedule
  nextOccurrenceAt: string     // ISO datetime
  occurrenceCount: number
  parentQuestId?: string       // For child executions
  isPaused?: boolean           // Pause/resume support
}

// ============================================================================
// Service Input/Output Types
// ============================================================================

/**
 * Input for creating a Quest from confirmed interpretation
 */
export type QuestCreateInput = {
  organizationId: string
  userId: string
  originalPrompt: string
  interpretation: QuestInterpretationResult
  userModifications?: Partial<QuestRecipientSelection>
  confirmedSchedule?: QuestScheduleIntent
  confirmedReminders?: QuestReminderIntent
}

/**
 * Input for updating Quest selection
 */
export type QuestUpdateInput = {
  confirmedSelection?: QuestConfirmedSelection
  scheduleConfig?: QuestScheduleConfig
  remindersConfig?: Quest['remindersConfig']
  subject?: string
  body?: string
  htmlBody?: string
}

/**
 * Result from Quest execution
 */
export type QuestExecutionResult = {
  success: boolean
  emailsSent: number
  taskIds: string[]
  errors?: Array<{
    email: string
    error: string
  }>
}

// ============================================================================
// Organization Context (for LLM prompt injection)
// ============================================================================

/**
 * Organization context injected into LLM system prompt
 * Ensures LLM can only output valid labels that exist in the user's organization
 */
export type OrganizationContext = {
  availableContactTypes: string[]  // ["EMPLOYEE", "VENDOR", "CLIENT", ...]
  availableGroups: Array<{
    id: string
    name: string
  }>
  availableStateKeys: Array<{
    stateKey: string
    count: number
  }>
}
