/**
 * Unified Activity Event Types & Metadata Interfaces
 *
 * All event types use dot-notation: "{category}.{action}"
 * This enables efficient filtering by category prefix.
 */

// ─── Event Types ─────────────────────────────────────────────────────────────

export type ActivityEventType =
  // Task lifecycle
  | "task.created"
  | "task.status_changed"
  | "task.archived"
  | "task.deleted"
  | "task.completed"
  | "task.auto_in_progress"
  | "task.snapshot_created"
  // Field edits
  | "task.name_changed"
  | "task.description_changed"
  | "task.due_date_changed"
  | "task.owner_changed"
  | "task.notes_changed"
  | "task.custom_fields_changed"
  | "task.labels_changed"
  | "task.client_changed"
  | "task.type_changed"
  | "task.report_config_changed"
  | "task.recon_config_changed"
  // Collaborators
  | "collaborator.added"
  | "collaborator.removed"
  // Comments
  | "comment.added"
  | "comment.deleted"
  // Attachments
  | "attachment.uploaded"
  // Email / Requests
  | "email.sent"
  | "email.reply_received"
  | "email.bounced"
  | "request.status_changed"
  // Reminders
  | "reminder.sent"
  // Forms
  | "form.request_sent"
  | "form.submitted"
  // Labels
  | "label.created"
  | "label.deleted"
  | "label.contact_assigned"
  | "label.contact_removed"
  // Collection / Evidence
  | "evidence.approved"
  | "evidence.rejected"
  | "evidence.reset"
  | "evidence.deleted"

export type ActivityActorType = "user" | "system" | "agent" | "workflow"

export type ActivityTargetType =
  | "comment"
  | "attachment"
  | "collaborator"
  | "label"
  | "collected_item"
  | "form_request"
  | "request"
  | "message"
  | "reminder"

// ─── Metadata Interfaces ─────────────────────────────────────────────────────

export interface FieldChangeMetadata {
  field: string
  oldValue: unknown
  newValue: unknown
}

export interface StatusChangeMetadata {
  oldStatus: string
  newStatus: string
  customStatus?: string | null
}

export interface CollaboratorMetadata {
  userId: string
  userName?: string | null
  userEmail?: string
}

export interface EmailMetadata {
  messageId?: string
  subject?: string
  recipientName?: string
  recipientEmail?: string
  requestId?: string
  requestName?: string
}

export interface FormMetadata {
  formRequestId?: string
  formDefinitionId?: string
  formName?: string
  recipientName?: string
  recipientCount?: number
}

export interface EvidenceMetadata {
  itemIds: string[]
  count: number
  action: "approve" | "reject" | "reset" | "delete"
}

// ─── Input Type ──────────────────────────────────────────────────────────────

export interface CreateActivityEventInput {
  organizationId: string
  taskInstanceId?: string | null
  requestId?: string | null
  formRequestId?: string | null
  boardId?: string | null
  eventType: ActivityEventType
  actorId?: string | null
  actorType?: ActivityActorType
  summary: string
  metadata?: Record<string, unknown> | null
  targetId?: string | null
  targetType?: ActivityTargetType | null
}
