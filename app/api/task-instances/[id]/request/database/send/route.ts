/**
 * Database Send API
 * 
 * Send personalized emails using data from a Database instead of CSV upload.
 * Supports period filtering for recurring boards.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { DatabaseService, DatabaseSchema, DatabaseRow } from "@/lib/services/database.service"
import { UserRole, CampaignType } from "@prisma/client"
import { renderTemplate } from "@/lib/utils/template-renderer"

interface ReminderConfig {
  enabled: boolean
  frequencyDays?: number
  maxCount?: number
}

interface SendRequestBody {
  databaseId: string
  boardPeriod?: string // Optional period filter (e.g., "Q1 2026")
  subjectTemplate: string
  bodyTemplate: string
  reminderConfig?: ReminderConfig
}

interface SendResult {
  email: string
  success: boolean
  requestId?: string
  error?: string
}

// Helper to normalize column keys for matching
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "")
}

// Check if a column matches email patterns
function findEmailColumn(columns: { key: string }[]): string | null {
  const emailPatterns = ["email", "emailaddress", "recipientemail", "contactemail", "mail"]
  for (const col of columns) {
    const key = normalizeKey(col.key)
    if (emailPatterns.some(p => key.includes(p))) {
      return col.key
    }
  }
  return null
}

// Check if a column matches first name patterns
function findFirstNameColumn(columns: { key: string }[]): string | null {
  const namePatterns = ["firstname", "first", "name"]
  for (const col of columns) {
    const key = normalizeKey(col.key)
    // Avoid matching "company_name" or "last_name"
    if (key.includes("company") || key.includes("last")) continue
    if (namePatterns.some(p => key === p || key.includes("firstname"))) {
      return col.key
    }
  }
  return null
}

// Check if a column matches period patterns
function findPeriodColumn(columns: { key: string }[]): string | null {
  const periodPatterns = ["period", "timeperiod", "reportingperiod"]
  for (const col of columns) {
    const key = normalizeKey(col.key)
    if (periodPatterns.some(p => key.includes(p))) {
      return col.key
    }
  }
  return null
}

// Simple email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    // Verify task instance access
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Parse request body
    const body: SendRequestBody = await request.json()
    const { databaseId, boardPeriod, subjectTemplate, bodyTemplate, reminderConfig } = body

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 })
    }
    if (!subjectTemplate || !bodyTemplate) {
      return NextResponse.json({ error: "Subject and body templates are required" }, { status: 400 })
    }

    // Fetch database
    const database = await DatabaseService.getDatabase(databaseId, organizationId)
    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const schema = database.schema as DatabaseSchema
    const allRows = database.rows as DatabaseRow[]

    // Find required columns
    const emailColumnKey = findEmailColumn(schema.columns)
    const firstNameColumnKey = findFirstNameColumn(schema.columns)
    const periodColumnKey = findPeriodColumn(schema.columns)

    if (!emailColumnKey) {
      return NextResponse.json({ error: "Database must have an email column" }, { status: 400 })
    }
    if (!firstNameColumnKey) {
      return NextResponse.json({ error: "Database must have a first name column" }, { status: 400 })
    }

    // Filter rows by period if specified
    let filteredRows = allRows
    if (boardPeriod && periodColumnKey) {
      const normalizedPeriod = boardPeriod.toLowerCase().trim()
      filteredRows = allRows.filter(row => {
        const rowPeriod = row[periodColumnKey]
        if (!rowPeriod) return false
        return String(rowPeriod).toLowerCase().trim() === normalizedPeriod
      })
    }

    // Filter to valid emails only
    const validRows = filteredRows.filter(row => {
      const email = row[emailColumnKey]
      return email && isValidEmail(String(email))
    })

    if (validRows.length === 0) {
      return NextResponse.json({ 
        error: boardPeriod 
          ? `No valid recipients found for period "${boardPeriod}"` 
          : "No valid email addresses in database" 
      }, { status: 400 })
    }

    // Get existing contacts to avoid duplicates in contact creation
    const recipientEmails = validRows.map(r => String(r[emailColumnKey]).toLowerCase())
    const existingEntities = await prisma.entity.findMany({
      where: { organizationId, email: { in: recipientEmails, mode: "insensitive" } },
      select: { email: true }
    })
    const existingEmailsSet = new Set(existingEntities.map(e => e.email?.toLowerCase()))

    // Campaign name
    const campaignName = `Database Request: ${instance.name} - ${database.name} - ${new Date().toISOString().split('T')[0]}`

    // Send emails
    const results: SendResult[] = []
    let successCount = 0
    let failCount = 0
    const newContacts: { email: string; firstName: string | null; lastName: string | null }[] = []

    for (const row of validRows) {
      const email = String(row[emailColumnKey])
      const firstName = row[firstNameColumnKey] ? String(row[firstNameColumnKey]) : null

      // Build render data from all row columns
      const renderData: Record<string, string> = { email }
      for (const col of schema.columns) {
        const value = row[col.key]
        renderData[col.key] = value != null ? String(value) : ""
      }

      try {
        const subjectResult = renderTemplate(subjectTemplate, renderData)
        const bodyResult = renderTemplate(bodyTemplate, renderData)
        const htmlBody = bodyResult.rendered.replace(/\n/g, '<br>')

        const sendResult = await EmailSendingService.sendEmail({
          organizationId,
          userId,
          jobId: taskInstanceId,
          to: email,
          toName: firstName || undefined,
          subject: subjectResult.rendered,
          body: bodyResult.rendered,
          htmlBody,
          campaignName,
          campaignType: CampaignType.CUSTOM,
          deadlineDate: instance.dueDate || undefined,
          remindersConfig: reminderConfig?.enabled ? {
            enabled: true,
            startDelayHours: 24,
            frequencyHours: reminderConfig.frequencyDays ? reminderConfig.frequencyDays * 24 : 168,
            maxCount: reminderConfig.maxCount || 3,
            approved: true
          } : undefined
        })

        results.push({ email, success: true, requestId: sendResult.taskId })
        successCount++

        // Track new contacts
        if (!existingEmailsSet.has(email.toLowerCase())) {
          newContacts.push({
            email,
            firstName,
            lastName: null, // Could be extracted if schema has last_name column
          })
        }
      } catch (error: any) {
        console.error(`Failed to send to ${email}:`, error.message)
        results.push({ email, success: false, error: error.message })
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: filteredRows.length,
        sent: successCount,
        failed: failCount,
        skipped: filteredRows.length - validRows.length
      },
      campaignName,
      databaseName: database.name,
      periodFilter: boardPeriod || null,
      results: results.slice(0, 100),
      contactImport: {
        newContactCount: newContacts.length,
        existingContactCount: successCount - newContacts.length
      }
    })

  } catch (error: any) {
    console.error("Database send error:", error)
    return NextResponse.json(
      { error: "Failed to send emails", message: error.message },
      { status: 500 }
    )
  }
}
