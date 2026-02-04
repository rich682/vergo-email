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
import { DatabaseService, DatabaseRow, DatabaseSchema } from "@/lib/services/database.service"

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

    // Pre-create database rows if form is linked to a database
    let databaseRowIndices: Map<string, number> | null = null
    if (formDefinition.database) {
      databaseRowIndices = await this.preCreateDatabaseRows(
        formDefinition.database.id,
        formDefinition.fields as FormField[],
        formDefinition.columnMapping as Record<string, string>,
        recipients,
        taskInstance.board,
        organizationId
      )
    }

    // Create form requests for each entity recipient
    const formRequests = await Promise.all(
      recipients.map(async (recipient) => {
        const databaseRowIndex = databaseRowIndices?.get(recipient.id) ?? null
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
            databaseRowIndex,
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

    // Pre-create database rows if form is linked to a database
    let databaseRowIndices: Map<string, number> | null = null
    if (formDefinition.database) {
      databaseRowIndices = await this.preCreateDatabaseRows(
        formDefinition.database.id,
        formDefinition.fields as FormField[],
        formDefinition.columnMapping as Record<string, string>,
        recipients,
        taskInstance.board,
        organizationId
      )
    }

    // Create form requests for each recipient
    const formRequests = await Promise.all(
      recipients.map(async (recipient) => {
        const databaseRowIndex = databaseRowIndices?.get(recipient.id) ?? null
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
            databaseRowIndex,
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
   * Pre-create database rows for form recipients
   * Returns a map of userId -> rowIndex
   */
  private static async preCreateDatabaseRows(
    databaseId: string,
    fields: FormField[],
    columnMapping: Record<string, string>,
    recipients: Array<{ id: string; name: string | null; email: string }>,
    board: { periodStart: Date | null; periodEnd: Date | null; cadence: string } | null,
    organizationId: string
  ): Promise<Map<string, number>> {
    const database = await prisma.database.findFirst({
      where: { id: databaseId, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const schema = database.schema as DatabaseSchema
    const existingRows = (database.rows || []) as DatabaseRow[]
    const rowIndexMap = new Map<string, number>()

    // Determine email and name columns from mapping or schema
    const emailColumnKey = Object.entries(columnMapping).find(([fieldKey]) => 
      fieldKey.toLowerCase().includes("email")
    )?.[1] || schema.columns.find(c => 
      c.key.toLowerCase().includes("email")
    )?.key

    const nameColumnKey = Object.entries(columnMapping).find(([fieldKey]) => 
      fieldKey.toLowerCase().includes("first") || fieldKey.toLowerCase().includes("name")
    )?.[1] || schema.columns.find(c => 
      c.key.toLowerCase().includes("first") || c.key.toLowerCase() === "name"
    )?.key

    // Determine period column
    const periodColumnKey = schema.columns.find(c => 
      c.key.toLowerCase().includes("period")
    )?.key

    // Format period value
    let periodValue: string | null = null
    if (board?.periodStart && periodColumnKey) {
      const date = new Date(board.periodStart)
      periodValue = date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    }

    // Create rows for each recipient
    const newRows: DatabaseRow[] = []
    for (const recipient of recipients) {
      const row: DatabaseRow = {}

      // Set email
      if (emailColumnKey) {
        row[emailColumnKey] = recipient.email
      }

      // Set name
      if (nameColumnKey && recipient.name) {
        row[nameColumnKey] = recipient.name.split(" ")[0] // First name
      }

      // Set period
      if (periodColumnKey && periodValue) {
        row[periodColumnKey] = periodValue
      }

      // Add a status column if it exists
      const statusColumnKey = schema.columns.find(c => 
        c.key.toLowerCase() === "status" || c.key.toLowerCase() === "form_status"
      )?.key
      if (statusColumnKey) {
        row[statusColumnKey] = "PENDING"
      }

      // Initialize other columns to empty/null based on type
      for (const col of schema.columns) {
        if (!(col.key in row)) {
          row[col.key] = null
        }
      }

      newRows.push(row)
      rowIndexMap.set(recipient.id, existingRows.length + newRows.length - 1)
    }

    // Update database with new rows
    const allRows = [...existingRows, ...newRows]
    await prisma.database.update({
      where: { id: databaseId },
      data: {
        rows: allRows,
        rowCount: allRows.length,
      },
    })

    return rowIndexMap
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
      },
    })

    if (!formRequest) {
      throw new Error("Form request not found or access denied")
    }

    return this.processSubmission(formRequest, responseData)
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
      },
    })

    if (!formRequest) {
      throw new Error("Form request not found or invalid token")
    }

    return this.processSubmission(formRequest, responseData)
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

    // Update database row if linked
    if (formRequest.formDefinition.database && formRequest.databaseRowIndex !== null) {
      await this.updateDatabaseRow(
        formRequest.formDefinition.database.id,
        formRequest.databaseRowIndex,
        formRequest.formDefinition.columnMapping as Record<string, string>,
        responseData,
        formRequest.organizationId
      )
    }

    // Update form request
    const updated = await prisma.formRequest.update({
      where: { id: formRequest.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        responseData,
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

    return updated
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
      row[columnKey] = value
    }

    // Update status if column exists
    const schema = database.schema as DatabaseSchema
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

    await prisma.database.update({
      where: { id: databaseId },
      data: { rows },
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
