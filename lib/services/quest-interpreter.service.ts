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
import { ContactType } from "@prisma/client"
import { resolveRecipientsWithReasons } from "./recipient-filter.service"
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

// Valid contact types from Prisma schema
const VALID_CONTACT_TYPES: string[] = [
  "UNKNOWN",
  "EMPLOYEE", 
  "VENDOR",
  "CLIENT",
  "CONTRACTOR",
  "MANAGEMENT",
  "CUSTOM"
]

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
    // Get all groups for the organization
    const groups = await prisma.group.findMany({
      where: { organizationId },
      select: { id: true, name: true }
    })

    // Note: State keys functionality has been removed as part of the migration
    // to item-scoped labels. The availableStateKeys array is now always empty.
    return {
      availableContactTypes: VALID_CONTACT_TYPES.filter(t => t !== "UNKNOWN" && t !== "CUSTOM"),
      availableGroups: groups.map(g => ({ id: g.id, name: g.name })),
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
    const groupNames = context.availableGroups.map(g => g.name)
    const stateKeyNames = context.availableStateKeys.map(s => s.stateKey)
    
    return `You are an AI assistant that interprets natural language requests for sending emails to contacts.

Your task is to extract structured information from the user's request and map it to the organization's data model.

ORGANIZATION DATA MODEL:
- Available Contact Types: ${context.availableContactTypes.join(", ")}
- Available Groups: ${groupNames.length > 0 ? groupNames.join(", ") : "(none)"}
- Available Data Tags: ${stateKeyNames.length > 0 ? stateKeyNames.join(", ") : "(none)"}

INTERPRETATION RULES:
1. Map natural language to contact types:
   - "employees", "staff", "team members" → EMPLOYEE
   - "vendors", "suppliers" → VENDOR
   - "clients", "customers" → CLIENT
   - "contractors", "freelancers" → CONTRACTOR
   - "management", "managers", "executives" → MANAGEMENT

2. Identify groups ONLY if explicitly mentioned by name (case-insensitive match)
   - Do NOT assume or infer a group if the user doesn't mention one
   - "all employees" with no group mentioned → groupNames should be empty []
   - "employees in NY Office" → groupNames: ["NY Office"]

3. Identify data tags ONLY if explicitly mentioned with keywords like "include", "with", "missing", "who have", "who haven't":
   - "include invoice number" → This is about PERSONALIZATION, not filtering. Do NOT add to stateFilter.
   - "missing W-9" or "who haven't submitted W-9" → stateFilter with mode "missing" and stateKey "w9"
   - "with unpaid invoices" or "who have unpaid invoices" → stateFilter with mode "has" and stateKey "invoice"
   - Do NOT infer stateFilter unless the user explicitly mentions filtering by a data attribute
   - If no filtering keywords are used, stateFilter should be omitted entirely

4. Extract schedule information:
   - "by end of week" → deadline = next Friday
   - "by January 31st" → deadline = specific date
   - "immediately" or no timing mentioned → sendTiming = "immediate"

5. Extract reminder information:
   - "send reminders every Wednesday" → weekly reminders on Wednesday
   - "follow up daily" → daily reminders
   - "until they reply" → stopCondition = "reply"
   - "until the deadline" → stopCondition = "deadline"
   - "until deadline or reply" → stopCondition = "reply_or_deadline"

6. Determine request type (IMPORTANT):
   - "recurring" = open-ended, repeating requests with NO specific deadline
     - Phrases: "every week", "every Wednesday", "weekly", "monthly", "every month", "on an ongoing basis"
     - Example: "send an email to all employees every Wednesday" → requestType = "recurring"
   - "one-off" = single request, may have a deadline and reminders
     - Most requests are one-off unless they explicitly use recurring language
     - Example: "email employees about timesheets due Friday" → requestType = "one-off"
     - Example: "send reminders every Wednesday until Friday" → requestType = "one-off" (has a deadline)
   - Key distinction: "every X" without a deadline = recurring; "every X until Y" = one-off with reminders

CONFIDENCE LEVELS:
- "high": Exact match to known type/group names
- "medium": Fuzzy match or reasonable inference
- "low": Ambiguous or no clear match

OUTPUT FORMAT (JSON):
{
  "recipientSelection": {
    "contactTypes": ["EMPLOYEE"],  // Array of contact type names from the list above
    "groupNames": [],              // ONLY include if user explicitly mentions a group name - empty array if no group specified
    "stateFilter": null            // ONLY include if user explicitly wants to FILTER by data (e.g. "missing W-9", "who haven't submitted"). Set to null if not filtering.
  },
  "scheduleIntent": {
    "sendTiming": "immediate" | "scheduled",
    "scheduledDate": "2026-01-15",  // ISO date if scheduled
    "deadline": "2026-01-31"        // ISO date if mentioned
  },
  "reminderIntent": {
    "enabled": true,
    "frequency": "daily" | "weekly" | "biweekly",
    "dayOfWeek": 3,  // 0=Sunday, 1=Monday, ..., 6=Saturday
    "stopCondition": "reply" | "deadline" | "reply_or_deadline"
  },
  "requestType": "one-off" | "recurring",  // IMPORTANT: "recurring" only if open-ended with no deadline
  "confidence": "high" | "medium" | "low",
  "interpretationSummary": {
    "audienceDescription": "All employees",
    "scheduleDescription": "Send immediately, due by January 31st",
    "reminderDescription": "Reminders every Wednesday until deadline or reply",
    "assumptions": ["Interpreted 'employees' as type EMPLOYEE"]
  },
  "warnings": [
    {
      "type": "ambiguous_term",
      "message": "Could not find group 'Marketing Team'",
      "suggestion": "Did you mean 'Marketing'?"
    }
  ]
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
- Only output contact types from the available list
- Only output group names that exist in the organization AND are explicitly mentioned by the user
- Do NOT infer or assume groups - if user says "all employees" without mentioning a group, groupNames must be empty []
- If no clear audience is specified, set confidence to "low" and add a warning
- Always provide assumptions explaining your interpretation
- When in doubt, leave groupNames empty - the user can add a group in the confirmation step`
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
    
    // Validate contact types
    const validContactTypes = (parsed.recipientSelection?.contactTypes || [])
      .filter(t => VALID_CONTACT_TYPES.includes(t.toUpperCase()))
      .map(t => t.toUpperCase())
    
    if (parsed.recipientSelection?.contactTypes?.length && validContactTypes.length === 0) {
      warnings.push({
        type: "no_matching_type",
        message: `Contact type(s) not recognized: ${parsed.recipientSelection.contactTypes.join(", ")}`,
        suggestion: `Available types: ${VALID_CONTACT_TYPES.filter(t => t !== "UNKNOWN" && t !== "CUSTOM").join(", ")}`
      })
    }

    // Validate group names
    const groupNameMap = new Map(context.availableGroups.map(g => [g.name.toLowerCase(), g.name]))
    const validGroupNames = (parsed.recipientSelection?.groupNames || [])
      .map(name => groupNameMap.get(name.toLowerCase()))
      .filter((name): name is string => name !== undefined)
    
    const invalidGroupNames = (parsed.recipientSelection?.groupNames || [])
      .filter(name => !groupNameMap.has(name.toLowerCase()))
    
    if (invalidGroupNames.length > 0) {
      warnings.push({
        type: "ambiguous_term",
        message: `Group(s) not found: ${invalidGroupNames.join(", ")}`,
        suggestion: context.availableGroups.length > 0 
          ? `Available groups: ${context.availableGroups.map(g => g.name).join(", ")}`
          : "No groups available in this organization"
      })
    }

    // Validate state keys
    const stateKeySet = new Set(context.availableStateKeys.map(s => s.stateKey.toLowerCase()))
    const requestedStateKeys = parsed.recipientSelection?.stateFilter?.stateKeys || []
    const validStateKeys = requestedStateKeys.filter(key => 
      stateKeySet.has(key.toLowerCase()) || 
      // Allow partial matches
      Array.from(stateKeySet).some(sk => sk.includes(key.toLowerCase()) || key.toLowerCase().includes(sk))
    )

    // Build validated recipient selection
    const recipientSelection: QuestRecipientSelection = {
      contactTypes: validContactTypes.length > 0 ? validContactTypes : undefined,
      groupNames: validGroupNames.length > 0 ? validGroupNames : undefined,
      stateFilter: validStateKeys.length > 0 ? {
        stateKeys: validStateKeys,
        mode: parsed.recipientSelection?.stateFilter?.mode || "has"
      } : undefined
    }

    // Check for empty audience
    if (!recipientSelection.contactTypes?.length && !recipientSelection.groupNames?.length) {
      warnings.push({
        type: "empty_audience",
        message: "No valid recipients identified. Please specify contact types or groups."
      })
    }

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
    const parts: string[] = []
    
    if (selection.contactTypes?.length) {
      const types = selection.contactTypes.map(t => t.toLowerCase() + "s")
      parts.push(`All ${types.join(" and ")}`)
    }
    
    if (selection.groupNames?.length) {
      parts.push(`in ${selection.groupNames.join(", ")}`)
    }
    
    if (selection.stateFilter) {
      const mode = selection.stateFilter.mode === "missing" ? "missing" : "with"
      parts.push(`${mode} ${selection.stateFilter.stateKeys.join(", ")}`)
    }
    
    return parts.length > 0 ? parts.join(" ") : "No audience specified"
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
    // Convert semantic selection to database query format
    const groupIds = selection.groupNames
      ?.map(name => context.availableGroups.find(g => g.name === name)?.id)
      .filter((id): id is string => id !== undefined)

    const dbSelection = {
      contactTypes: selection.contactTypes,
      groupIds: groupIds?.length ? groupIds : undefined,
      stateFilter: selection.stateFilter ? {
        stateKeys: selection.stateFilter.stateKeys,
        mode: selection.stateFilter.mode
      } : undefined
    }

    // Use the recipient filter service to get actual counts
    const result = await resolveRecipientsWithReasons(organizationId, dbSelection)

    return {
      matchingRecipients: result.counts.included,
      excludedCount: result.counts.excluded
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
    // Convert semantic selection to database query format
    const groupIds = selection.groupNames
      ?.map(name => context.availableGroups.find(g => g.name === name)?.id)
      .filter((id): id is string => id !== undefined)

    const dbSelection = {
      contactTypes: selection.contactTypes,
      groupIds: groupIds?.length ? groupIds : undefined,
      stateFilter: selection.stateFilter ? {
        stateKeys: selection.stateFilter.stateKeys,
        mode: selection.stateFilter.mode
      } : undefined
    }

    // Use the recipient filter service to get actual recipients
    const result = await resolveRecipientsWithReasons(organizationId, dbSelection)

    // Note: Tag values functionality has been removed as part of the migration
    // to item-scoped labels. Recipients are returned without tag values.
    return result.recipientsWithReasons.map(r => ({
      id: r.entityId,
      email: r.email,
      name: (r.firstName || r.name) ?? undefined,
      contactType: r.contactType ?? undefined,
      tagValues: undefined
    }))
  }
}

// Type for raw LLM response (before validation)
type LLMInterpretationResponse = {
  recipientSelection?: {
    contactTypes?: string[]
    groupNames?: string[]
    stateFilter?: {
      stateKeys?: string[]
      mode?: "has" | "missing"
    }
  }
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
