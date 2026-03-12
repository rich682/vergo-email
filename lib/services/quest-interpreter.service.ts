/**
 * Quest Interpreter Service
 * 
 * Translates natural language prompts into structured Quest intent.
 * The LLM interprets prompts and maps them to the organization's data model
 * (contact types, groups, state keys) for user confirmation.
 * 
 * Key principles:
 * - LLM outputs semantic labels (type names, group names), NOT entity IDs
 * - Server resolves labels to actual entities
 * - Organization context is injected into LLM prompt to ensure valid outputs
 */

import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import { prisma } from "@/lib/prisma"
import type {
  QuestInterpretRequest,
  QuestInterpretationResult,
  QuestRecipientSelection,
  QuestScheduleIntent,
  QuestReminderIntent,
  QuestConfidence,
  QuestInterpretationSummary,
  QuestWarning,
  QuestResolvedCounts,
  OrganizationContext
} from "@/lib/types/quest"

// Core entity fields that should never appear as data tags
const EXCLUDED_STATE_KEYS = new Set([
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "email",
  "phone",
  "type",
  "groups",
  "contacttype",
  "contact_type",
  "name",
  "company",
  "address",
  "city",
  "state",
  "zip",
  "country"
])

export class QuestInterpreterService {
  /**
   * Fetch organization context for LLM prompt injection
   */
  static async getOrganizationContext(organizationId: string): Promise<OrganizationContext> {
    // Contact types and groups have been removed as part of the contacts feature removal.
    // All arrays are now empty - recipients are resolved via direct entity/user IDs.
    return {
      availableContactTypes: [],
      availableGroups: [],
      availableStateKeys: []
    }
  }

  /**
   * Interpret a natural language prompt into structured Quest intent
   */
  static async interpret(
    organizationId: string,
    request: QuestInterpretRequest
  ): Promise<QuestInterpretationResult> {
    const { prompt } = request
    
    // Get organization context for LLM
    const context = await this.getOrganizationContext(organizationId)
    
    // Build LLM prompt with organization context
    const systemPrompt = this.buildSystemPrompt(context)
    
    // Call LLM for interpretation
    const openai = getOpenAIClient()
    
    const completion = await callOpenAI(openai, {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent interpretation
      max_tokens: 1000
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from LLM")
    }

    // Parse LLM response
    const parsed = JSON.parse(response) as LLMInterpretationResponse
    
    // Validate and transform LLM output
    const result = await this.transformLLMResponse(organizationId, parsed, context)
    
    return result
  }

  /**
   * Build the system prompt with organization context
   */
  private static buildSystemPrompt(context: OrganizationContext): string {
    return `You are an AI assistant that interprets natural language requests for sending emails to recipients.

Your task is to extract structured information from the user's request.

INTERPRETATION RULES:
1. Extract schedule information:
   - "by end of week" → deadline = next Friday
   - "by January 31st" → deadline = specific date
   - "immediately" or no timing mentioned → sendTiming = "immediate"

2. Extract reminder information:
   - "send reminders every Wednesday" → weekly reminders on Wednesday
   - "follow up daily" → daily reminders
   - "until they reply" → stopCondition = "reply"
   - "until the deadline" → stopCondition = "deadline"
   - "until deadline or reply" → stopCondition = "reply_or_deadline"

3. Determine request type (IMPORTANT):
   - "recurring" = open-ended, repeating requests with NO specific deadline
     - Phrases: "every week", "every Wednesday", "weekly", "monthly", "every month", "on an ongoing basis"
     - Example: "send an email every Wednesday" → requestType = "recurring"
   - "one-off" = single request, may have a deadline and reminders
     - Most requests are one-off unless they explicitly use recurring language
     - Example: "email about timesheets due Friday" → requestType = "one-off"
     - Example: "send reminders every Wednesday until Friday" → requestType = "one-off" (has a deadline)
   - Key distinction: "every X" without a deadline = recurring; "every X until Y" = one-off with reminders

CONFIDENCE LEVELS:
- "high": Clear, unambiguous request
- "medium": Reasonable inference
- "low": Ambiguous or unclear

OUTPUT FORMAT (JSON):
{
  "recipientSelection": {},
  "scheduleIntent": {
    "sendTiming": "immediate" | "scheduled",
    "scheduledDate": "2026-01-15",
    "deadline": "2026-01-31"
  },
  "reminderIntent": {
    "enabled": true,
    "frequency": "daily" | "weekly" | "biweekly",
    "dayOfWeek": 3,
    "stopCondition": "reply" | "deadline" | "reply_or_deadline"
  },
  "requestType": "one-off" | "recurring",
  "confidence": "high" | "medium" | "low",
  "interpretationSummary": {
    "audienceDescription": "Selected recipients",
    "scheduleDescription": "Send immediately, due by January 31st",
    "reminderDescription": "Reminders every Wednesday until deadline or reply",
    "assumptions": []
  },
  "warnings": []
}

TODAY'S DATE: ${new Date().toISOString().split('T')[0]} (${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })})

DATE CALCULATION RULES:
- "this Friday" or "by Friday" = the upcoming Friday from today's date
- "next Friday" = the Friday after this week's Friday
- "end of week" = this Friday
- "by end of week" = deadline is this Friday
- Always calculate dates relative to TODAY'S DATE shown above
- If today is Monday Jan 13, 2026, then "this Friday" = January 16, 2026

IMPORTANT:
- If no clear audience is specified, set confidence to "low" and add a warning
- Always provide assumptions explaining your interpretation`
  }

  /**
   * Transform and validate LLM response
   */
  private static async transformLLMResponse(
    organizationId: string,
    parsed: LLMInterpretationResponse,
    context: OrganizationContext
  ): Promise<QuestInterpretationResult> {
    const warnings: QuestWarning[] = [...(parsed.warnings || [])]

    // Recipient selection is now handled via direct entity/user IDs.
    // Contact types, groups, and state filters have been removed.
    const recipientSelection: QuestRecipientSelection = {}

    // Build schedule intent with date validation
    const scheduleIntent: QuestScheduleIntent = {
      sendTiming: parsed.scheduleIntent?.sendTiming || "immediate",
      scheduledDate: this.validateDate(parsed.scheduleIntent?.scheduledDate),
      deadline: this.validateDate(parsed.scheduleIntent?.deadline)
    }

    // Build reminder intent
    const reminderIntent: QuestReminderIntent = {
      enabled: parsed.reminderIntent?.enabled ?? false,
      frequency: parsed.reminderIntent?.frequency,
      dayOfWeek: parsed.reminderIntent?.dayOfWeek,
      stopCondition: parsed.reminderIntent?.stopCondition || "reply_or_deadline"
    }

    // Determine confidence
    let confidence: QuestConfidence = parsed.confidence || "medium"
    if (warnings.some(w => w.type === "empty_audience" || w.type === "no_matching_type")) {
      confidence = "low"
    }

    // Build interpretation summary
    const interpretationSummary: QuestInterpretationSummary = {
      audienceDescription: this.buildAudienceDescription(recipientSelection),
      scheduleDescription: this.buildScheduleDescription(scheduleIntent),
      reminderDescription: reminderIntent.enabled 
        ? this.buildReminderDescription(reminderIntent)
        : undefined,
      assumptions: parsed.interpretationSummary?.assumptions || []
    }

    // Resolve recipient counts
    const resolvedCounts = await this.resolveRecipientCounts(organizationId, recipientSelection, context)

    // Add warning if no recipients found
    if (resolvedCounts.matchingRecipients === 0 && !warnings.some(w => w.type === "empty_audience")) {
      warnings.push({
        type: "empty_audience",
        message: "No contacts match the specified criteria."
      })
      confidence = "low"
    }

    // Determine request type from LLM response
    // Default to one-off unless LLM explicitly says recurring
    const requestType: "one-off" | "recurring" = parsed.requestType === "recurring" ? "recurring" : "one-off"

    return {
      recipientSelection,
      scheduleIntent,
      reminderIntent,
      requestType,
      confidence,
      interpretationSummary,
      warnings,
      resolvedCounts
    }
  }

  /**
   * Validate and normalize date string
   */
  private static validateDate(dateStr?: string): string | undefined {
    if (!dateStr) return undefined
    
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return undefined
      return date.toISOString().split('T')[0]
    } catch {
      return undefined
    }
  }

  /**
   * Build human-readable audience description
   */
  private static buildAudienceDescription(selection: QuestRecipientSelection): string {
    if (selection.entityIds?.length || selection.userIds?.length) {
      const count = (selection.entityIds?.length || 0) + (selection.userIds?.length || 0)
      return `${count} selected recipient(s)`
    }
    return "No audience specified"
  }

  /**
   * Build human-readable schedule description
   */
  private static buildScheduleDescription(schedule: QuestScheduleIntent): string {
    const parts: string[] = []
    
    if (schedule.sendTiming === "scheduled" && schedule.scheduledDate) {
      parts.push(`Send on ${this.formatDate(schedule.scheduledDate)}`)
    } else {
      parts.push("Send immediately")
    }
    
    if (schedule.deadline) {
      parts.push(`due by ${this.formatDate(schedule.deadline)}`)
    }
    
    return parts.join(", ")
  }

  /**
   * Build human-readable reminder description
   */
  private static buildReminderDescription(reminder: QuestReminderIntent): string {
    if (!reminder.enabled) return ""
    
    const parts: string[] = ["Reminders"]
    
    if (reminder.frequency === "daily") {
      parts.push("every day")
    } else if (reminder.frequency === "weekly" && reminder.dayOfWeek !== undefined) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      parts.push(`every ${days[reminder.dayOfWeek]}`)
    } else if (reminder.frequency === "biweekly") {
      parts.push("every two weeks")
    }
    
    if (reminder.stopCondition === "reply") {
      parts.push("until reply")
    } else if (reminder.stopCondition === "deadline") {
      parts.push("until deadline")
    } else {
      parts.push("until deadline or reply")
    }
    
    return parts.join(" ")
  }

  /**
   * Format date for display
   */
  private static formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      })
    } catch {
      return dateStr
    }
  }

  /**
   * Resolve recipient counts by querying the database
   */
  private static async resolveRecipientCounts(
    organizationId: string,
    selection: QuestRecipientSelection,
    context: OrganizationContext
  ): Promise<QuestResolvedCounts> {
    // Contact-based recipient resolution has been removed.
    // Counts are now resolved via direct entity/user IDs at execution time.
    return {
      matchingRecipients: 0,
      excludedCount: 0
    }
  }

  /**
   * Resolve recipients with details for preview
   */
  static async resolveRecipientsForPreview(
    organizationId: string,
    selection: QuestRecipientSelection,
    context: OrganizationContext
  ): Promise<Array<{
    id?: string
    email: string
    name?: string
    contactType?: string
    tagValues?: Record<string, string>
  }>> {
    // Contact-based recipient resolution has been removed.
    // Recipients are now resolved via direct entity/user IDs at execution time.
    return []
  }
}

// Type for raw LLM response (before validation)
type LLMInterpretationResponse = {
  recipientSelection?: {}
  scheduleIntent?: {
    sendTiming?: "immediate" | "scheduled"
    scheduledDate?: string
    deadline?: string
  }
  reminderIntent?: {
    enabled?: boolean
    frequency?: "daily" | "weekly" | "biweekly"
    dayOfWeek?: number
    stopCondition?: "reply" | "deadline" | "reply_or_deadline"
  }
  requestType?: "one-off" | "recurring"
  confidence?: QuestConfidence
  interpretationSummary?: {
    audienceDescription?: string
    scheduleDescription?: string
    reminderDescription?: string
    assumptions?: string[]
  }
  warnings?: QuestWarning[]
}
