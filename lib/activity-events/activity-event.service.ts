/**
 * Activity Event Service
 *
 * Central service for logging all activity events across the application.
 * Follows the WorkflowAuditService pattern: non-blocking, errors caught + logged.
 * Activity logging should never fail the parent operation.
 */

import { prisma } from "@/lib/prisma"
import type {
  CreateActivityEventInput,
  ActivityEventType,
  StatusChangeMetadata,
  FieldChangeMetadata,
  CollaboratorMetadata,
  EmailMetadata,
  EvidenceMetadata,
} from "./types"

export class ActivityEventService {
  /**
   * Log a single activity event. Non-blocking — errors are caught and logged.
   */
  static async log(input: CreateActivityEventInput): Promise<void> {
    try {
      await prisma.activityEvent.create({
        data: {
          organizationId: input.organizationId,
          taskInstanceId: input.taskInstanceId || null,
          requestId: input.requestId || null,
          formRequestId: input.formRequestId || null,
          boardId: input.boardId || null,
          eventType: input.eventType,
          actorId: input.actorId || null,
          actorType: input.actorType || "user",
          summary: input.summary,
          metadata: (input.metadata ?? undefined) as any,
          targetId: input.targetId || null,
          targetType: input.targetType || null,
        },
      })
    } catch (error) {
      // Activity logging should never block the parent operation
      console.error("[ActivityEvent] Failed to log event:", error)
    }
  }

  /**
   * Log multiple activity events in batch. Non-blocking.
   */
  static async logMany(inputs: CreateActivityEventInput[]): Promise<void> {
    if (inputs.length === 0) return
    try {
      await prisma.activityEvent.createMany({
        data: inputs.map((input) => ({
          organizationId: input.organizationId,
          taskInstanceId: input.taskInstanceId || null,
          requestId: input.requestId || null,
          formRequestId: input.formRequestId || null,
          boardId: input.boardId || null,
          eventType: input.eventType,
          actorId: input.actorId || null,
          actorType: input.actorType || "user",
          summary: input.summary,
          metadata: (input.metadata || null) as any,
          targetId: input.targetId || null,
          targetType: input.targetType || null,
        })),
      })
    } catch (error) {
      console.error("[ActivityEvent] Failed to log events:", error)
    }
  }

  // ─── Convenience Helpers ─────────────────────────────────────────────────

  /**
   * Log a task status change. Fire-and-forget.
   */
  static logStatusChange(opts: {
    organizationId: string
    taskInstanceId: string
    actorId: string
    actorName: string
    oldStatus: string
    newStatus: string
    customStatus?: string | null
    boardId?: string | null
  }): void {
    const displayStatus = opts.customStatus || opts.newStatus
    this.log({
      organizationId: opts.organizationId,
      taskInstanceId: opts.taskInstanceId,
      boardId: opts.boardId,
      eventType: "task.status_changed",
      actorId: opts.actorId,
      actorType: "user",
      summary: `${opts.actorName} changed status from ${opts.oldStatus} to ${displayStatus}`,
      metadata: {
        oldStatus: opts.oldStatus,
        newStatus: opts.newStatus,
        customStatus: opts.customStatus ?? null,
      } satisfies StatusChangeMetadata,
    }).catch((err) =>
      console.error("[ActivityEvent] logStatusChange failed:", err)
    )
  }

  /**
   * Log field edit(s) on a task instance. Emits one event per changed field.
   * Fire-and-forget.
   */
  static logFieldChanges(opts: {
    organizationId: string
    taskInstanceId: string
    actorId: string
    actorName: string
    changes: Array<{
      field: string
      oldValue: unknown
      newValue: unknown
      displayField?: string
    }>
    boardId?: string | null
  }): void {
    const events: CreateActivityEventInput[] = opts.changes.map((change) => {
      const fieldLabel = change.displayField || change.field
      return {
        organizationId: opts.organizationId,
        taskInstanceId: opts.taskInstanceId,
        boardId: opts.boardId,
        eventType: `task.${change.field}_changed` as ActivityEventType,
        actorId: opts.actorId,
        actorType: "user" as const,
        summary: `${opts.actorName} updated ${fieldLabel}`,
        metadata: {
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        } satisfies FieldChangeMetadata,
      }
    })
    if (events.length > 0) {
      this.logMany(events).catch((err) =>
        console.error("[ActivityEvent] logFieldChanges failed:", err)
      )
    }
  }

  /**
   * Log collaborator added or removed. Fire-and-forget.
   */
  static logCollaboratorChange(opts: {
    organizationId: string
    taskInstanceId: string
    actorId: string
    actorName: string
    targetUserId: string
    targetUserName?: string | null
    targetUserEmail?: string
    action: "added" | "removed"
    boardId?: string | null
  }): void {
    const targetName =
      opts.targetUserName || opts.targetUserEmail || "a user"
    this.log({
      organizationId: opts.organizationId,
      taskInstanceId: opts.taskInstanceId,
      boardId: opts.boardId,
      eventType:
        opts.action === "added" ? "collaborator.added" : "collaborator.removed",
      actorId: opts.actorId,
      actorType: "user",
      summary: `${opts.actorName} ${opts.action} ${targetName} as collaborator`,
      metadata: {
        userId: opts.targetUserId,
        userName: opts.targetUserName ?? null,
        userEmail: opts.targetUserEmail,
      } satisfies CollaboratorMetadata,
      targetId: opts.targetUserId,
      targetType: "collaborator",
    }).catch((err) =>
      console.error("[ActivityEvent] logCollaboratorChange failed:", err)
    )
  }

  /**
   * Log an outbound email sent. Fire-and-forget.
   */
  static logEmailSent(opts: {
    organizationId: string
    taskInstanceId?: string | null
    requestId: string
    actorId?: string | null
    actorName?: string
    subject?: string
    recipientName?: string
    recipientEmail?: string
    messageId?: string
    requestName?: string
  }): void {
    const sender = opts.actorName || "System"
    const recipient =
      opts.recipientName || opts.recipientEmail || "recipient"
    this.log({
      organizationId: opts.organizationId,
      taskInstanceId: opts.taskInstanceId,
      requestId: opts.requestId,
      eventType: "email.sent",
      actorId: opts.actorId,
      actorType: opts.actorId ? "user" : "system",
      summary: `${sender} sent a request to ${recipient}`,
      metadata: {
        messageId: opts.messageId,
        subject: opts.subject,
        recipientName: opts.recipientName,
        recipientEmail: opts.recipientEmail,
        requestId: opts.requestId,
        requestName: opts.requestName,
      } satisfies EmailMetadata,
      targetId: opts.messageId,
      targetType: "message",
    }).catch((err) =>
      console.error("[ActivityEvent] logEmailSent failed:", err)
    )
  }

  /**
   * Log an inbound email reply or bounce. Fire-and-forget.
   */
  static logEmailReplyReceived(opts: {
    organizationId: string
    taskInstanceId?: string | null
    requestId: string
    subject?: string
    senderName?: string
    senderEmail?: string
    messageId?: string
    isBounce?: boolean
  }): void {
    const eventType = opts.isBounce ? "email.bounced" : "email.reply_received"
    const sender = opts.senderName || opts.senderEmail || "Contact"
    const action = opts.isBounce ? "bounced" : "replied to a request"
    this.log({
      organizationId: opts.organizationId,
      taskInstanceId: opts.taskInstanceId,
      requestId: opts.requestId,
      eventType,
      actorType: "system",
      summary: `${sender} ${action}`,
      metadata: {
        messageId: opts.messageId,
        subject: opts.subject,
        recipientName: opts.senderName,
        recipientEmail: opts.senderEmail,
      } satisfies EmailMetadata,
      targetId: opts.messageId,
      targetType: "message",
    }).catch((err) =>
      console.error("[ActivityEvent] logEmailReply failed:", err)
    )
  }

  /**
   * Log evidence bulk action (approve/reject/reset/delete). Fire-and-forget.
   */
  static logEvidenceAction(opts: {
    organizationId: string
    taskInstanceId: string
    actorId: string
    actorName: string
    itemIds: string[]
    action: "approve" | "reject" | "reset" | "delete"
  }): void {
    const eventTypeMap = {
      approve: "evidence.approved",
      reject: "evidence.rejected",
      reset: "evidence.reset",
      delete: "evidence.deleted",
    } as const
    this.log({
      organizationId: opts.organizationId,
      taskInstanceId: opts.taskInstanceId,
      eventType: eventTypeMap[opts.action],
      actorId: opts.actorId,
      actorType: "user",
      summary: `${opts.actorName} ${opts.action === "reset" ? "reset" : opts.action + "d"} ${opts.itemIds.length} evidence item(s)`,
      metadata: {
        itemIds: opts.itemIds,
        count: opts.itemIds.length,
        action: opts.action,
      } satisfies EvidenceMetadata,
    }).catch((err) =>
      console.error("[ActivityEvent] logEvidenceAction failed:", err)
    )
  }
}
