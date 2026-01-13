/**
 * Quest Service
 * 
 * Semantic wrapper around EmailDraft that provides Quest-specific functionality.
 * This abstraction allows future migration to a dedicated Quest table without
 * rewriting business logic.
 * 
 * Key responsibilities:
 * - Create Quests from confirmed interpretations
 * - Manage Quest lifecycle (interpreting → confirmed → generating → ready → executing → completed)
 * - Generate email content for Quests
 * - Execute Quests (delegate to EmailSendingService)
 */

import { prisma } from "@/lib/prisma"
import { EmailDraftService } from "./email-draft.service"
import { AIEmailGenerationService } from "./ai-email-generation.service"
import { EmailSendingService } from "./email-sending.service"
import { resolveRecipientsWithReasons } from "./recipient-filter.service"
import type {
  Quest,
  QuestType,
  QuestStatus,
  QuestCreateInput,
  QuestUpdateInput,
  QuestExecutionResult,
  QuestInterpretationResult,
  QuestConfirmedSelection,
  QuestScheduleConfig,
  InterpretationSnapshot,
  StandingQuestMetadata,
  StandingQuestSchedule
} from "@/lib/types/quest"

// Metadata key for Quest data stored in EmailDraft JSON columns
const QUEST_METADATA_KEY = "questMetadata"

export class QuestService {
  /**
   * Create a Quest from a confirmed interpretation
   */
  static async createFromInterpretation(input: QuestCreateInput): Promise<Quest> {
    const {
      organizationId,
      userId,
      originalPrompt,
      interpretation,
      userModifications,
      confirmedSchedule,
      confirmedReminders
    } = input

    // Merge interpretation with user modifications
    const confirmedSelection: QuestConfirmedSelection = {
      contactTypes: userModifications?.contactTypes || interpretation.recipientSelection.contactTypes,
      groupIds: await this.resolveGroupIds(
        organizationId,
        userModifications?.groupNames || interpretation.recipientSelection.groupNames
      ),
      stateFilter: interpretation.recipientSelection.stateFilter ? {
        stateKeys: interpretation.recipientSelection.stateFilter.stateKeys,
        mode: interpretation.recipientSelection.stateFilter.mode
      } : undefined
    }

    // Build schedule config
    const scheduleConfig: QuestScheduleConfig | undefined = confirmedSchedule ? {
      type: confirmedSchedule.deadline ? "deadline" : "immediate",
      deadline: confirmedSchedule.deadline ? new Date(confirmedSchedule.deadline) : undefined
    } : undefined

    // Build reminders config
    const remindersConfig = confirmedReminders?.enabled ? {
      enabled: true,
      startDelayHours: this.calculateStartDelayHours(confirmedReminders.frequency),
      frequencyHours: this.calculateFrequencyHours(confirmedReminders.frequency),
      maxCount: this.calculateMaxReminders(confirmedSchedule?.deadline, confirmedReminders.frequency),
      stopCondition: confirmedReminders.stopCondition
    } : undefined

    // Build interpretation snapshot for audit
    const interpretationSnapshot: InterpretationSnapshot = {
      prompt: originalPrompt,
      interpretedSelection: interpretation.recipientSelection,
      interpretedSchedule: interpretation.scheduleIntent,
      interpretedReminders: interpretation.reminderIntent,
      confidence: interpretation.confidence,
      assumptions: interpretation.interpretationSummary.assumptions,
      userConfirmed: !userModifications,
      userModifications: userModifications ? {
        originalType: interpretation.recipientSelection.contactTypes,
        finalType: userModifications.contactTypes,
        originalGroup: interpretation.recipientSelection.groupNames,
        finalGroup: userModifications.groupNames
      } : undefined,
      timestamp: new Date().toISOString()
    }

    // Create underlying EmailDraft
    const emailDraft = await EmailDraftService.create({
      organizationId,
      userId,
      prompt: originalPrompt,
      suggestedRecipients: {
        entityIds: [],
        groupIds: confirmedSelection.groupIds || [],
        contactTypes: confirmedSelection.contactTypes
      },
      suggestedCampaignName: `Quest: ${originalPrompt.substring(0, 50)}`,
      aiGenerationStatus: "processing"
    })

    // Store Quest metadata in EmailDraft (using existing JSON columns)
    await this.updateQuestMetadata(emailDraft.id, organizationId, {
      questType: "one_time",
      status: "pending_confirmation",
      confirmedSelection,
      scheduleConfig,
      remindersConfig,
      interpretationSnapshot,
      originalPrompt
    })

    return this.emailDraftToQuest(emailDraft, {
      questType: "one_time",
      status: "pending_confirmation",
      confirmedSelection,
      scheduleConfig,
      remindersConfig,
      interpretationSnapshot,
      originalPrompt
    })
  }

  /**
   * Get Quest by ID
   */
  static async findById(id: string, organizationId: string): Promise<Quest | null> {
    console.log(`QuestService.findById: Looking for quest ${id} in org ${organizationId}`)
    
    const emailDraft = await EmailDraftService.findById(id, organizationId)
    if (!emailDraft) {
      console.log(`QuestService.findById: EmailDraft not found for ${id}`)
      return null
    }
    
    console.log(`QuestService.findById: Found EmailDraft ${id}, userId: ${emailDraft.userId}`)

    const metadata = await this.getQuestMetadata(id, organizationId)
    if (!metadata) {
      // Not a Quest, just a regular EmailDraft
      console.log(`QuestService.findById: No quest metadata found for ${id}`)
      return null
    }
    
    console.log(`QuestService.findById: Found quest metadata, status: ${metadata.status}`)

    return this.emailDraftToQuest(emailDraft, metadata)
  }

  /**
   * Update Quest selection (before email generation)
   */
  static async updateSelection(
    id: string,
    organizationId: string,
    selection: QuestConfirmedSelection
  ): Promise<Quest> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }

    // Update metadata
    await this.updateQuestMetadata(id, organizationId, {
      confirmedSelection: selection
    })

    // Update EmailDraft recipients
    await EmailDraftService.update(id, organizationId, {
      suggestedRecipients: {
        entityIds: [],
        groupIds: selection.groupIds || [],
        contactTypes: selection.contactTypes
      }
    })

    return (await this.findById(id, organizationId))!
  }

  /**
   * Generate email content for Quest
   */
  static async generateEmail(id: string, organizationId: string): Promise<Quest> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }

    // Update status to generating
    await this.updateQuestMetadata(id, organizationId, {
      status: "generating"
    })

    try {
      // Get user info for signature
      const user = await prisma.user.findFirst({
        where: { id: quest.userId },
        select: { name: true, email: true, signature: true }
      })

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true }
      })

      // Generate email using AI service
      const generated = await AIEmailGenerationService.generateDraft({
        organizationId,
        prompt: quest.originalPrompt,
        selectedRecipients: {
          entityIds: [],
          groupIds: quest.confirmedSelection.groupIds || []
        },
        senderName: user?.name || undefined,
        senderEmail: user?.email || undefined,
        senderCompany: organization?.name || undefined,
        deadlineDate: quest.scheduleConfig?.deadline || null,
        personalizationMode: "contact",
        availableTags: ["First Name", "Email"]
      })

      // Update EmailDraft with generated content
      await EmailDraftService.update(id, organizationId, {
        generatedSubject: generated.subject,
        generatedBody: generated.body,
        generatedHtmlBody: generated.htmlBody,
        subjectTemplate: generated.subjectTemplate,
        bodyTemplate: generated.bodyTemplate,
        htmlBodyTemplate: generated.htmlBodyTemplate,
        aiGenerationStatus: "complete"
      })

      // Update status to ready
      await this.updateQuestMetadata(id, organizationId, {
        status: "ready"
      })

      return (await this.findById(id, organizationId))!
    } catch (error) {
      // Update status to failed
      await this.updateQuestMetadata(id, organizationId, {
        status: "failed"
      })
      throw error
    }
  }

  /**
   * Execute Quest (send emails)
   */
  static async execute(id: string, organizationId: string): Promise<QuestExecutionResult> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }

    if (quest.status !== "ready") {
      throw new Error(`Quest is not ready for execution. Current status: ${quest.status}`)
    }

    // Update status to executing
    await this.updateQuestMetadata(id, organizationId, {
      status: "executing"
    })

    try {
      // Resolve recipients
      const recipientResult = await resolveRecipientsWithReasons(organizationId, {
        contactTypes: quest.confirmedSelection.contactTypes,
        groupIds: quest.confirmedSelection.groupIds,
        stateFilter: quest.confirmedSelection.stateFilter
      })

      if (recipientResult.recipients.length === 0) {
        throw new Error("No recipients to send to")
      }

      // Build reminders config for EmailSendingService
      const remindersConfig = quest.remindersConfig?.enabled ? {
        enabled: true,
        startDelayHours: quest.remindersConfig.startDelayHours,
        frequencyHours: quest.remindersConfig.frequencyHours,
        maxCount: quest.remindersConfig.maxCount,
        approved: true
      } : undefined

      // Send emails
      const results = await EmailSendingService.sendBulkEmail({
        organizationId,
        recipients: recipientResult.recipients.map(r => ({
          email: r.email,
          name: r.firstName || r.name || undefined
        })),
        subject: quest.subject || "",
        body: quest.body || "",
        htmlBody: quest.htmlBody,
        campaignName: `Quest: ${quest.originalPrompt.substring(0, 50)}`,
        deadlineDate: quest.scheduleConfig?.deadline || null,
        remindersConfig
      })

      const successful = results.filter(r => !r.error)
      const errors = results.filter(r => r.error).map(r => ({
        email: r.email,
        error: r.error || "Unknown error"
      }))

      // Update status
      const finalStatus: QuestStatus = errors.length === 0 ? "completed" : 
        successful.length > 0 ? "completed" : "failed"

      await this.updateQuestMetadata(id, organizationId, {
        status: finalStatus,
        executedAt: new Date().toISOString()
      })

      // Update EmailDraft status
      await EmailDraftService.update(id, organizationId, {
        status: "SENT"
      })

      return {
        success: successful.length > 0,
        emailsSent: successful.length,
        taskIds: successful.map(r => r.taskId),
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error: any) {
      await this.updateQuestMetadata(id, organizationId, {
        status: "failed"
      })
      throw error
    }
  }

  /**
   * List Quests for organization
   */
  static async findByOrganization(organizationId: string, userId?: string): Promise<Quest[]> {
    const emailDrafts = await EmailDraftService.findByOrganization(organizationId, userId)
    
    const quests: Quest[] = []
    for (const draft of emailDrafts) {
      const metadata = await this.getQuestMetadata(draft.id, organizationId)
      if (metadata) {
        quests.push(this.emailDraftToQuest(draft, metadata))
      }
    }
    
    return quests
  }

  // ============================================================================
  // Standing Quest Methods (Phase 4)
  // ============================================================================

  /**
   * Create a standing (recurring) quest
   */
  static async createStandingQuest(
    input: QuestCreateInput & {
      standingSchedule: StandingQuestSchedule
    }
  ): Promise<Quest> {
    const quest = await this.createFromInterpretation(input)
    
    // Calculate next occurrence
    const nextOccurrence = this.calculateNextOccurrence(input.standingSchedule)
    
    // Update with standing quest metadata
    await this.updateQuestMetadata(quest.id, input.organizationId, {
      questType: "standing",
      standingSchedule: input.standingSchedule,
      nextOccurrenceAt: nextOccurrence.toISOString(),
      occurrenceCount: 0,
      isPaused: false
    })
    
    return (await this.findById(quest.id, input.organizationId))!
  }

  /**
   * Find standing quests due for execution
   */
  static async findDueStandingQuests(): Promise<Quest[]> {
    const now = new Date()
    
    // Find all email drafts with standing quest metadata
    const drafts = await prisma.emailDraft.findMany({
      where: {
        status: { not: "SENT" }
      }
    })
    
    const dueQuests: Quest[] = []
    
    for (const draft of drafts) {
      const metadata = await this.getQuestMetadata(draft.id, draft.organizationId)
      if (!metadata) continue
      if (metadata.questType !== "standing") continue
      if (metadata.isPaused) continue
      if (!metadata.nextOccurrenceAt) continue
      
      const nextOccurrence = new Date(metadata.nextOccurrenceAt)
      if (nextOccurrence <= now) {
        dueQuests.push(this.emailDraftToQuest(draft, metadata))
      }
    }
    
    return dueQuests
  }

  /**
   * Execute a standing quest occurrence with idempotency
   * Uses CAS (Compare-And-Swap) to prevent duplicate executions
   */
  static async executeStandingOccurrence(
    id: string,
    organizationId: string
  ): Promise<QuestExecutionResult & { childQuestId?: string }> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }
    
    if (quest.questType !== "standing") {
      throw new Error("Quest is not a standing quest")
    }
    
    const metadata = await this.getQuestMetadata(id, organizationId)
    if (!metadata?.standingSchedule) {
      throw new Error("Standing quest missing schedule configuration")
    }
    
    // CAS: Atomically increment occurrence count to claim this execution
    const expectedCount = metadata.occurrenceCount || 0
    const idempotencyKey = `quest:${id}:occurrence:${expectedCount + 1}`
    
    // Check if this occurrence was already executed
    const existingChild = await prisma.emailDraft.findFirst({
      where: {
        organizationId,
        suggestedRecipients: {
          path: [QUEST_METADATA_KEY, 'idempotencyKey'],
          equals: idempotencyKey
        }
      }
    })
    
    if (existingChild) {
      // Already executed, return success without re-executing
      return {
        success: true,
        emailsSent: 0,
        taskIds: [],
        childQuestId: existingChild.id
      }
    }
    
    // Create child quest for this occurrence
    const childQuest = await this.createChildQuest(quest, idempotencyKey)
    
    // Generate email for child
    await this.generateEmail(childQuest.id, organizationId)
    
    // Execute child quest
    const result = await this.execute(childQuest.id, organizationId)
    
    // Update parent quest with new occurrence count and next occurrence
    const nextOccurrence = this.calculateNextOccurrence(metadata.standingSchedule)
    
    await this.updateQuestMetadata(id, organizationId, {
      occurrenceCount: expectedCount + 1,
      nextOccurrenceAt: nextOccurrence.toISOString(),
      lastExecutedAt: new Date().toISOString()
    })
    
    return {
      ...result,
      childQuestId: childQuest.id
    }
  }

  /**
   * Pause a standing quest
   */
  static async pauseStandingQuest(id: string, organizationId: string): Promise<Quest> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }
    
    if (quest.questType !== "standing") {
      throw new Error("Quest is not a standing quest")
    }
    
    await this.updateQuestMetadata(id, organizationId, {
      isPaused: true
    })
    
    return (await this.findById(id, organizationId))!
  }

  /**
   * Resume a standing quest
   */
  static async resumeStandingQuest(id: string, organizationId: string): Promise<Quest> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }
    
    if (quest.questType !== "standing") {
      throw new Error("Quest is not a standing quest")
    }
    
    const metadata = await this.getQuestMetadata(id, organizationId)
    
    // Recalculate next occurrence from now
    const nextOccurrence = this.calculateNextOccurrence(metadata?.standingSchedule!)
    
    await this.updateQuestMetadata(id, organizationId, {
      isPaused: false,
      nextOccurrenceAt: nextOccurrence.toISOString()
    })
    
    return (await this.findById(id, organizationId))!
  }

  /**
   * Cancel a standing quest
   */
  static async cancelStandingQuest(id: string, organizationId: string): Promise<Quest> {
    const quest = await this.findById(id, organizationId)
    if (!quest) {
      throw new Error("Quest not found")
    }
    
    await this.updateQuestMetadata(id, organizationId, {
      status: "completed",
      isPaused: true
    })
    
    return (await this.findById(id, organizationId))!
  }

  /**
   * Create a child quest for a standing quest occurrence
   */
  private static async createChildQuest(
    parentQuest: Quest,
    idempotencyKey: string
  ): Promise<Quest> {
    // Create a new EmailDraft as a child
    const emailDraft = await EmailDraftService.create({
      organizationId: parentQuest.organizationId,
      userId: parentQuest.userId,
      prompt: parentQuest.originalPrompt,
      suggestedRecipients: {
        entityIds: [],
        groupIds: parentQuest.confirmedSelection.groupIds || [],
        contactTypes: parentQuest.confirmedSelection.contactTypes
      },
      suggestedCampaignName: `Quest Occurrence: ${parentQuest.originalPrompt.substring(0, 40)}`,
      aiGenerationStatus: "processing"
    })
    
    // Store child quest metadata
    await this.updateQuestMetadata(emailDraft.id, parentQuest.organizationId, {
      questType: "one_time",
      status: "pending_confirmation",
      confirmedSelection: parentQuest.confirmedSelection,
      scheduleConfig: parentQuest.scheduleConfig,
      remindersConfig: parentQuest.remindersConfig,
      originalPrompt: parentQuest.originalPrompt,
      parentQuestId: parentQuest.id,
      idempotencyKey
    })
    
    return (await this.findById(emailDraft.id, parentQuest.organizationId))!
  }

  /**
   * Calculate the next occurrence time for a standing quest
   */
  private static calculateNextOccurrence(schedule: StandingQuestSchedule): Date {
    const now = new Date()
    const [hours, minutes] = schedule.timeOfDay.split(':').map(Number)
    
    // Start with today at the specified time
    let next = new Date(now)
    next.setHours(hours, minutes, 0, 0)
    
    // If the time has passed today, start from tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }
    
    switch (schedule.frequency) {
      case "daily":
        // Already set to next occurrence
        break
        
      case "weekly":
        // Find the next occurrence of the specified day of week
        if (schedule.dayOfWeek !== undefined) {
          const currentDay = next.getDay()
          const targetDay = schedule.dayOfWeek
          let daysUntil = targetDay - currentDay
          if (daysUntil <= 0) {
            daysUntil += 7
          }
          next.setDate(next.getDate() + daysUntil)
        }
        break
        
      case "monthly":
        // Find the next occurrence of the specified day of month
        if (schedule.dayOfMonth !== undefined) {
          next.setDate(schedule.dayOfMonth)
          if (next <= now) {
            next.setMonth(next.getMonth() + 1)
          }
        }
        break
    }
    
    return next
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Resolve group names to group IDs
   */
  private static async resolveGroupIds(
    organizationId: string,
    groupNames?: string[]
  ): Promise<string[] | undefined> {
    if (!groupNames?.length) return undefined

    const groups = await prisma.group.findMany({
      where: {
        organizationId,
        name: { in: groupNames }
      },
      select: { id: true }
    })

    return groups.map(g => g.id)
  }

  /**
   * Calculate start delay hours based on frequency
   */
  private static calculateStartDelayHours(frequency?: string): number {
    switch (frequency) {
      case "daily": return 24
      case "weekly": return 48 // 2 days
      case "biweekly": return 72 // 3 days
      default: return 48
    }
  }

  /**
   * Calculate frequency hours based on frequency type
   */
  private static calculateFrequencyHours(frequency?: string): number {
    switch (frequency) {
      case "daily": return 24
      case "weekly": return 168 // 7 days
      case "biweekly": return 336 // 14 days
      default: return 72 // 3 days
    }
  }

  /**
   * Calculate max reminders based on deadline and frequency
   */
  private static calculateMaxReminders(deadline?: string, frequency?: string): number {
    if (!deadline) return 3 // Default

    const deadlineDate = new Date(deadline)
    const now = new Date()
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    switch (frequency) {
      case "daily": return Math.min(5, Math.max(1, daysUntilDeadline - 1))
      case "weekly": return Math.min(5, Math.max(1, Math.floor(daysUntilDeadline / 7)))
      case "biweekly": return Math.min(5, Math.max(1, Math.floor(daysUntilDeadline / 14)))
      default: return 3
    }
  }

  /**
   * Get Quest metadata from EmailDraft
   */
  private static async getQuestMetadata(
    id: string,
    organizationId: string
  ): Promise<QuestMetadata | null> {
    const draft = await prisma.emailDraft.findFirst({
      where: { id, organizationId },
      select: { suggestedRecipients: true }
    })

    if (!draft?.suggestedRecipients) {
      console.log(`getQuestMetadata: No suggestedRecipients for ${id}`)
      return null
    }

    const recipients = draft.suggestedRecipients as any
    const metadata = recipients[QUEST_METADATA_KEY] || null
    
    console.log(`getQuestMetadata: Found recipients for ${id}, has metadata: ${!!metadata}`)
    
    return metadata
  }

  /**
   * Update Quest metadata in EmailDraft
   */
  private static async updateQuestMetadata(
    id: string,
    organizationId: string,
    updates: Partial<QuestMetadata>
  ): Promise<void> {
    const draft = await prisma.emailDraft.findFirst({
      where: { id, organizationId },
      select: { suggestedRecipients: true }
    })

    const currentRecipients = (draft?.suggestedRecipients as any) || {}
    const currentMetadata = currentRecipients[QUEST_METADATA_KEY] || {}

    const updatedMetadata = {
      ...currentMetadata,
      ...updates
    }

    await prisma.emailDraft.update({
      where: { id },
      data: {
        suggestedRecipients: {
          ...currentRecipients,
          [QUEST_METADATA_KEY]: updatedMetadata
        }
      }
    })
  }

  /**
   * Convert EmailDraft to Quest
   */
  private static emailDraftToQuest(
    emailDraft: any,
    metadata: QuestMetadata
  ): Quest {
    return {
      id: emailDraft.id,
      organizationId: emailDraft.organizationId,
      userId: emailDraft.userId,
      questType: metadata.questType || "one_time",
      status: metadata.status || "pending_confirmation",
      originalPrompt: metadata.originalPrompt || emailDraft.prompt,
      interpretationSnapshot: metadata.interpretationSnapshot,
      confirmedSelection: metadata.confirmedSelection || {},
      scheduleConfig: metadata.scheduleConfig,
      remindersConfig: metadata.remindersConfig,
      subject: emailDraft.generatedSubject || emailDraft.subjectTemplate,
      body: emailDraft.generatedBody || emailDraft.bodyTemplate,
      htmlBody: emailDraft.generatedHtmlBody || emailDraft.htmlBodyTemplate,
      subjectTemplate: emailDraft.subjectTemplate,
      bodyTemplate: emailDraft.bodyTemplate,
      emailDraftId: emailDraft.id,
      createdAt: emailDraft.createdAt,
      updatedAt: emailDraft.updatedAt,
      confirmedAt: metadata.confirmedAt ? new Date(metadata.confirmedAt) : undefined,
      executedAt: metadata.executedAt ? new Date(metadata.executedAt) : undefined
    }
  }
}

// Internal type for Quest metadata stored in EmailDraft
type QuestMetadata = {
  questType?: QuestType
  status?: QuestStatus
  confirmedSelection?: QuestConfirmedSelection
  scheduleConfig?: QuestScheduleConfig
  remindersConfig?: Quest['remindersConfig']
  interpretationSnapshot?: InterpretationSnapshot
  originalPrompt?: string
  confirmedAt?: string
  executedAt?: string
  // Standing quest fields
  standingSchedule?: StandingQuestSchedule
  nextOccurrenceAt?: string
  occurrenceCount?: number
  isPaused?: boolean
  lastExecutedAt?: string
  parentQuestId?: string
  idempotencyKey?: string
}
