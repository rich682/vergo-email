/**
 * Form Request Service
 * 
 * Business logic for managing form requests sent to users or external stakeholders.
 * Handles creating requests, tracking submissions, and updating database rows.
 */

import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"
import type { 
  FormField, 
  FormRequestStatus, 
  CreateFormRequestsInput,
  FormRequestProgress,
  DEFAULT_REMINDER_CONFIG,
} from "@/lib/types/form"
import { DatabaseService, DatabaseRow, DatabaseSchema, MAX_ROWS } from "@/lib/services/database.service"

// Default reminder configuration
const defaultReminderConfig = {
  enabled: false,
  frequencyHours: 72,  // 3 days
  maxCount: 3,
}

// Normalized recipient type for both users and entities
interface FormRecipient {
  id: string
  name: string | null
  email: string
  isEntity: boolean // true = external stakeholder (Entity), false = internal user (User)
}

// Generate a secure access token
function generateAccessToken(): string {
  return randomBytes(32).toString("hex")
}

export class FormRequestService {
  /**
   * Create form requests for multiple entity recipients (stakeholders)
   * Pre-creates database rows if the form is linked to a database
   */
  static async createBulkForEntities(
    organizationId: string,
    taskInstanceId: string,
    input: {
      formDefinitionId: string
      recipientEntityIds: string[]
      deadlineDate?: Date
      reminderConfig?: {
        enabled: boolean
        frequencyHours?: number
        maxCount?: number
      }
    }
  ) {
    const { formDefinitionId, recipientEntityIds, deadlineDate, reminderConfig } = input

    // Get the form definition
    const formDefinition = await prisma.formDefinition.findFirst({
      where: {
        id: formDefinitionId,
        organizationId,
      },
      include: {
        database: true,
      },
    })

    if (!formDefinition) {
      throw new Error("Form not found or access denied")
    }

    // Verify all entity recipients exist and belong to the organization
    const entities = await prisma.entity.findMany({
      where: {
        id: { in: recipientEntityIds },
        organizationId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    })

    if (entities.length !== recipientEntityIds.length) {
      throw new Error("One or more recipients not found or access denied")
    }

    // Filter entities that have email addresses
    const validEntities = entities.filter(e => e.email)
    if (validEntities.length === 0) {
      throw new Error("No recipients have valid email addresses")
    }

    // Get task instance for period information
    const taskInstance = await prisma.taskInstance.findFirst({
      where: {
        id: taskInstanceId,
        organizationId,
      },
      include: {
        board: true,
      },
    })

    if (!taskInstance) {
      throw new Error("Task not found")
    }

    // Calculate next reminder time if reminders are enabled
    const config = { ...defaultReminderConfig, ...reminderConfig }
    const nextReminderAt = config.enabled && deadlineDate
      ? new Date(Date.now() + config.frequencyHours * 60 * 60 * 1000)
      : null

    // Normalize entities to recipients format
    const recipients: FormRecipient[] = validEntities.map(e => ({
      id: e.id,
      name: e.firstName + (e.lastName ? ` ${e.lastName}` : ""),
      email: e.email!,
      isEntity: true,
    }))

    // Create form requests for each entity recipient
    // Note: Database rows are created when the form is submitted, not when sent
    const formRequests = await Promise.all(
      recipients.map(async (recipient) => {
        const accessToken = generateAccessToken()

        return prisma.formRequest.create({
          data: {
            organizationId,
            taskInstanceId,
            formDefinitionId,
            recipientEntityId: recipient.id,
            accessToken,
            status: "PENDING",
            deadlineDate: deadlineDate || null,
            remindersEnabled: config.enabled,
            remindersMaxCount: config.maxCount,
            reminderFrequencyHours: config.frequencyHours,
            nextReminderAt,
            databaseRowIndex: null, // Row created on submission, not on send
          },
          include: {
            recipientEntity: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            formDefinition: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      })
    )

    return {
      formRequests,
      count: formRequests.length,
    }
  }

  /**
   * Create form requests for multiple recipients (legacy method for internal users)
   * Pre-creates database rows if the form is linked to a database
   */
  static async createBulk(
    organizationId: string,
    taskInstanceId: string,
    input: CreateFormRequestsInput
  ) {
    const { formDefinitionId, recipientUserIds, deadlineDate, reminderConfig } = input

    // Get the form definition
    const formDefinition = await prisma.formDefinition.findFirst({
      where: {
        id: formDefinitionId,
        organizationId,
      },
      include: {
        database: true,
      },
    })

    if (!formDefinition) {
      throw new Error("Form not found or access denied")
    }

    // Verify all recipients exist and belong to the organization
    const users = await prisma.user.findMany({
      where: {
        id: { in: recipientUserIds },
        organizationId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })

    if (users.length !== recipientUserIds.length) {
      throw new Error("One or more recipients not found or access denied")
    }

    // Get task instance for period information
    const taskInstance = await prisma.taskInstance.findFirst({
      where: {
        id: taskInstanceId,
        organizationId,
      },
      include: {
        board: true,
      },
    })

    if (!taskInstance) {
      throw new Error("Task not found")
    }

    // Calculate next reminder time if reminders are enabled
    const config = { ...defaultReminderConfig, ...reminderConfig }
    const nextReminderAt = config.enabled && deadlineDate
      ? new Date(Date.now() + config.frequencyHours * 60 * 60 * 1000)
      : null

    // Normalize users to recipients format
    const recipients: FormRecipient[] = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isEntity: false,
    }))

    // Create form requests for each recipient
    // Note: Database rows are created when the form is submitted, not when sent
    const formRequests = await Promise.all(
      recipients.map(async (recipient) => {
        const accessToken = generateAccessToken()

        return prisma.formRequest.create({
          data: {
            organizationId,
            taskInstanceId,
            formDefinitionId,
            recipientUserId: recipient.id,
            accessToken,
            status: "PENDING",
            deadlineDate: deadlineDate || null,
            remindersEnabled: config.enabled,
            remindersMaxCount: config.maxCount,
            reminderFrequencyHours: config.frequencyHours,
            nextReminderAt,
            databaseRowIndex: null, // Row created on submission, not on send
          },
          include: {
            recipientUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            formDefinition: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      })
    )

    return {
      formRequests,
      count: formRequests.length,
    }
  }

  /**
   * Find form request by ID
   */
  static async findById(id: string, organizationId: string) {
    return prisma.formRequest.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        formDefinition: {
          include: {
            database: {
              select: {
                id: true,
                name: true,
                schema: true,
                rows: true,
              },
            },
          },
        },
        recipientUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recipientEntity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        taskInstance: {
          select: {
            id: true,
            name: true,
            board: {
              select: {
                periodStart: true,
                periodEnd: true,
                cadence: true,
              },
            },
          },
        },
      },
    })
  }

  /**
   * Find form request by access token (for external stakeholder access)
   */
  static async findByToken(accessToken: string) {
    return prisma.formRequest.findFirst({
      where: {
        accessToken,
      },
      include: {
        formDefinition: {
          include: {
            database: {
              select: {
                id: true,
                name: true,
                schema: true,
                rows: true,
              },
            },
          },
        },
        recipientUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recipientEntity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        taskInstance: {
          select: {
            id: true,
            name: true,
            board: {
              select: {
                periodStart: true,
                periodEnd: true,
                cadence: true,
              },
            },
          },
        },
      },
    })
  }

  /**
   * Find all form requests for a task
   */
  static async findByTask(taskInstanceId: string, organizationId: string) {
    return prisma.formRequest.findMany({
      where: {
        taskInstanceId,
        organizationId,
      },
      include: {
        formDefinition: {
          select: {
            id: true,
            name: true,
            databaseId: true,
            fields: true,
          },
        },
        recipientUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recipientEntity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: {
          select: {
            id: true,
            filename: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
            fieldKey: true,
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { createdAt: "desc" },
      ],
    })
  }

  /**
   * Find pending form requests for a user
   */
  static async findByRecipient(userId: string, organizationId: string) {
    return prisma.formRequest.findMany({
      where: {
        recipientUserId: userId,
        organizationId,
        status: "PENDING",
      },
      include: {
        formDefinition: {
          select: {
            id: true,
            name: true,
            description: true,
            fields: true,
          },
        },
        taskInstance: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        deadlineDate: "asc",
      },
    })
  }

  /**
   * Submit a form response (for internal users with login)
   */
  static async submit(
    formRequestId: string,
    userId: string,
    responseData: Record<string, unknown>
  ) {
    // Get the form request and verify ownership
    const formRequest = await prisma.formRequest.findFirst({
      where: {
        id: formRequestId,
        recipientUserId: userId,
      },
      include: {
        formDefinition: {
          include: {
            database: true,
          },
        },
        recipientUser: {
          select: { id: true, name: true, email: true },
        },
        taskInstance: {
          select: { id: true, board: { select: { periodStart: true, periodEnd: true, cadence: true } } },
        },
        attachments: {
          select: { id: true, filename: true, url: true, mimeType: true, sizeBytes: true, fieldKey: true },
        },
      },
    })

    if (!formRequest) {
      throw new Error("Form request not found or access denied")
    }

    return this.processSubmission(formRequest as any, responseData)
  }

  /**
   * Submit a form response using access token (for external stakeholders)
   */
  static async submitByToken(
    accessToken: string,
    responseData: Record<string, unknown>
  ) {
    // Get the form request by token
    const formRequest = await prisma.formRequest.findFirst({
      where: {
        accessToken,
      },
      include: {
        formDefinition: {
          include: {
            database: true,
          },
        },
        recipientEntity: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        taskInstance: {
          select: { id: true, board: { select: { periodStart: true, periodEnd: true, cadence: true } } },
        },
        attachments: {
          select: { id: true, filename: true, url: true, mimeType: true, sizeBytes: true, fieldKey: true },
        },
      },
    })

    if (!formRequest) {
      throw new Error("Form request not found or invalid token")
    }

    return this.processSubmission(formRequest as any, responseData)
  }

  /**
   * Process form submission (shared logic for both user and token-based submissions)
   */
  private static async processSubmission(
    formRequest: {
      id: string
      status: string
      organizationId: string
      databaseRowIndex: number | null
      formDefinition: {
        id: string
        name: string
        fields: any
        settings: any
        columnMapping: any
        database: { id: string } | null
      }
      recipientUser?: { id: string; name: string | null; email: string } | null
      recipientEntity?: { id: string; firstName: string; lastName: string | null; email: string | null } | null
      taskInstance?: { id: string; board: { periodStart: Date | null; periodEnd: Date | null; cadence: string } | null } | null
      attachments?: Array<{ id: string; filename: string; url: string; mimeType: string | null; sizeBytes: number | null; fieldKey: string }>
    },
    responseData: Record<string, unknown>
  ) {
    if (formRequest.status === "SUBMITTED" && !formRequest.formDefinition.settings) {
      throw new Error("Form has already been submitted")
    }

    const settings = formRequest.formDefinition.settings as { allowEdit?: boolean } || {}
    if (formRequest.status === "SUBMITTED" && !settings.allowEdit) {
      throw new Error("Form has already been submitted and editing is not allowed")
    }

    // Validate required fields
    const fields = formRequest.formDefinition.fields as FormField[]
    for (const field of fields) {
      if (field.required) {
        const value = responseData[field.key]
        if (value === undefined || value === null || value === "") {
          throw new Error(`Field "${field.label}" is required`)
        }
      }
    }

    // Create or update database row if linked
    let newDatabaseRowIndex = formRequest.databaseRowIndex
    if (formRequest.formDefinition.database) {
      if (formRequest.databaseRowIndex === null) {
        // Create a new row on first submission
        const recipientName = formRequest.recipientUser?.name || 
          (formRequest.recipientEntity ? `${formRequest.recipientEntity.firstName}${formRequest.recipientEntity.lastName ? ` ${formRequest.recipientEntity.lastName}` : ""}` : null)
        const recipientEmail = formRequest.recipientUser?.email || formRequest.recipientEntity?.email || null

        newDatabaseRowIndex = await this.createDatabaseRow(
          formRequest.formDefinition.database.id,
          formRequest.formDefinition.columnMapping as Record<string, string>,
          responseData,
          { name: recipientName, email: recipientEmail },
          formRequest.taskInstance?.board || null,
          formRequest.organizationId
        )
      } else {
        // Update existing row
        await this.updateDatabaseRow(
          formRequest.formDefinition.database.id,
          formRequest.databaseRowIndex,
          formRequest.formDefinition.columnMapping as Record<string, string>,
          responseData,
          formRequest.organizationId
        )
      }
    }

    // Update form request
    const updated = await prisma.formRequest.update({
      where: { id: formRequest.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        responseData: responseData as any,
        databaseRowIndex: newDatabaseRowIndex,
        nextReminderAt: null, // Stop reminders
      },
      include: {
        formDefinition: {
          select: {
            id: true,
            name: true,
          },
        },
        recipientUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recipientEntity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    // Create CollectedItem records for form attachments
    if (formRequest.attachments && formRequest.attachments.length > 0 && formRequest.taskInstance?.id) {
      const recipientName = formRequest.recipientUser?.name || 
        (formRequest.recipientEntity ? `${formRequest.recipientEntity.firstName}${formRequest.recipientEntity.lastName ? ` ${formRequest.recipientEntity.lastName}` : ""}` : null)
      const recipientEmail = formRequest.recipientUser?.email || formRequest.recipientEntity?.email || null

      await Promise.all(
        formRequest.attachments.map(attachment =>
          prisma.collectedItem.create({
            data: {
              organizationId: formRequest.organizationId,
              taskInstanceId: formRequest.taskInstance!.id,
              filename: attachment.filename,
              fileKey: attachment.url, // Use URL as file key for form attachments
              fileUrl: attachment.url,
              fileSize: attachment.sizeBytes,
              mimeType: attachment.mimeType,
              source: "FORM_SUBMISSION",
              submittedBy: recipientEmail,
              submittedByName: recipientName,
              receivedAt: new Date(),
              metadata: {
                formRequestId: formRequest.id,
                formDefinitionId: formRequest.formDefinition.id,
                formName: formRequest.formDefinition.name,
                fieldKey: attachment.fieldKey,
              },
            },
          })
        )
      )
    }

    return updated
  }

  /**
   * Create a database row with form response data (called on submission)
   * Returns the index of the newly created row
   */
  private static async createDatabaseRow(
    databaseId: string,
    columnMapping: Record<string, string>,
    responseData: Record<string, unknown>,
    recipient: { name: string | null; email: string | null },
    board: { periodStart: Date | null; periodEnd: Date | null; cadence: string } | null,
    organizationId: string
  ): Promise<number> {
    const database = await prisma.database.findFirst({
      where: { id: databaseId, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const schema = database.schema as unknown as DatabaseSchema
    const existingRows = (database.rows || []) as unknown as DatabaseRow[]
    const schemaKeys = new Set(schema.columns.map(c => c.key))

    // Validate row capacity before inserting
    if (existingRows.length >= MAX_ROWS) {
      throw new Error(
        `Database has reached the ${MAX_ROWS.toLocaleString()} row limit. ` +
        `Form submission cannot be saved until rows are removed.`
      )
    }

    // Validate that mapped columns exist in the database schema
    for (const [fieldKey, columnKey] of Object.entries(columnMapping)) {
      if (columnKey && !schemaKeys.has(columnKey)) {
        console.warn(
          `Form field "${fieldKey}" maps to column "${columnKey}" which does not exist in database schema. Value will be stored with this key but won't appear in the schema view.`
        )
      }
    }

    // Create new row with response data
    const row: DatabaseRow = {}

    // Map form field values to database columns
    for (const [fieldKey, value] of Object.entries(responseData)) {
      const columnKey = columnMapping[fieldKey] || fieldKey
      row[columnKey] = value as any
    }

    // Add recipient info if columns exist
    const emailColumnKey = schema.columns.find(c => 
      c.key.toLowerCase().includes("email")
    )?.key
    if (emailColumnKey && recipient.email && !row[emailColumnKey]) {
      row[emailColumnKey] = recipient.email
    }

    const nameColumnKey = schema.columns.find(c => 
      c.key.toLowerCase().includes("first") || c.key.toLowerCase() === "name"
    )?.key
    if (nameColumnKey && recipient.name && !row[nameColumnKey]) {
      row[nameColumnKey] = recipient.name.split(" ")[0] // First name
    }

    // Add period if column exists
    const periodColumnKey = schema.columns.find(c => 
      c.key.toLowerCase().includes("period")
    )?.key
    if (periodColumnKey && board?.periodStart && !row[periodColumnKey]) {
      const date = new Date(board.periodStart)
      row[periodColumnKey] = date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    }

    // Add status column
    const statusColumnKey = schema.columns.find(c => 
      c.key.toLowerCase() === "status" || c.key.toLowerCase() === "form_status"
    )?.key
    if (statusColumnKey) {
      row[statusColumnKey] = "SUBMITTED"
    }

    // Add submitted_at if column exists
    const submittedAtKey = schema.columns.find(c => 
      c.key.toLowerCase() === "submitted_at" || c.key.toLowerCase() === "submittedat"
    )?.key
    if (submittedAtKey) {
      row[submittedAtKey] = new Date().toISOString()
    }

    // Initialize any missing columns to null
    for (const col of schema.columns) {
      if (!(col.key in row)) {
        row[col.key] = null
      }
    }

    // Add the new row using a transaction to prevent data loss on concurrent writes
    const newRowIndex = existingRows.length
    const allRows = [...existingRows, row]

    await prisma.$transaction(async (tx) => {
      await tx.database.update({
        where: { id: databaseId },
        data: {
          rows: allRows,
          rowCount: allRows.length,
        },
      })
    })

    return newRowIndex
  }

  /**
   * Update a database row with form response data
   */
  private static async updateDatabaseRow(
    databaseId: string,
    rowIndex: number,
    columnMapping: Record<string, string>,
    responseData: Record<string, unknown>,
    organizationId: string
  ) {
    const database = await prisma.database.findFirst({
      where: { id: databaseId, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const rows = (database.rows || []) as DatabaseRow[]
    if (rowIndex < 0 || rowIndex >= rows.length) {
      throw new Error("Invalid row index")
    }

    // Update the row with response data
    const row = { ...rows[rowIndex] }
    for (const [fieldKey, value] of Object.entries(responseData)) {
      const columnKey = columnMapping[fieldKey] || fieldKey
      row[columnKey] = value as any
    }

    // Update status if column exists
    const schema = database.schema as unknown as DatabaseSchema
    const statusColumnKey = schema.columns.find(c => 
      c.key.toLowerCase() === "status" || c.key.toLowerCase() === "form_status"
    )?.key
    if (statusColumnKey) {
      row[statusColumnKey] = "SUBMITTED"
    }

    // Update submitted_at if column exists
    const submittedAtKey = schema.columns.find(c => 
      c.key.toLowerCase() === "submitted_at" || c.key.toLowerCase() === "submittedat"
    )?.key
    if (submittedAtKey) {
      row[submittedAtKey] = new Date().toISOString()
    }

    rows[rowIndex] = row

    await prisma.$transaction(async (tx) => {
      await tx.database.update({
        where: { id: databaseId },
        data: { rows },
      })
    })
  }

  /**
   * Get progress stats for form requests on a task
   */
  static async getProgress(
    taskInstanceId: string,
    organizationId: string,
    formDefinitionId?: string
  ): Promise<FormRequestProgress> {
    const where: any = {
      taskInstanceId,
      organizationId,
    }
    if (formDefinitionId) {
      where.formDefinitionId = formDefinitionId
    }

    const requests = await prisma.formRequest.groupBy({
      by: ["status"],
      where,
      _count: { id: true },
    })

    const stats = {
      total: 0,
      submitted: 0,
      pending: 0,
      expired: 0,
    }

    for (const group of requests) {
      const count = group._count.id
      stats.total += count
      
      switch (group.status) {
        case "SUBMITTED":
          stats.submitted = count
          break
        case "PENDING":
          stats.pending = count
          break
        case "EXPIRED":
          stats.expired = count
          break
      }
    }

    return stats
  }

  /**
   * Send a reminder for a form request
   */
  static async sendReminder(formRequestId: string) {
    const formRequest = await prisma.formRequest.findUnique({
      where: { id: formRequestId },
      include: {
        recipientUser: {
          select: { id: true, name: true, email: true },
        },
        recipientEntity: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        formDefinition: {
          select: { name: true },
        },
        taskInstance: {
          select: { name: true },
        },
      },
    })

    if (!formRequest || formRequest.status !== "PENDING") {
      return null
    }

    // Update reminder count and next reminder time
    const nextReminderAt = formRequest.remindersSent + 1 < formRequest.remindersMaxCount
      ? new Date(Date.now() + formRequest.reminderFrequencyHours * 60 * 60 * 1000)
      : null

    await prisma.formRequest.update({
      where: { id: formRequestId },
      data: {
        remindersSent: formRequest.remindersSent + 1,
        nextReminderAt,
      },
    })

    return formRequest
  }

  /**
   * Find form requests due for reminders
   */
  static async findDueForReminders(limit: number = 100) {
    return prisma.formRequest.findMany({
      where: {
        status: "PENDING",
        remindersEnabled: true,
        nextReminderAt: {
          lte: new Date(),
        },
        remindersSent: {
          lt: prisma.formRequest.fields.remindersMaxCount,
        },
      },
      include: {
        recipientUser: {
          select: { id: true, name: true, email: true },
        },
        recipientEntity: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        formDefinition: {
          select: { name: true },
        },
        taskInstance: {
          select: { name: true },
        },
      },
      take: limit,
      orderBy: {
        nextReminderAt: "asc",
      },
    })
  }
}
