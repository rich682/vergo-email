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
import { normalizeEmail } from "@/lib/utils/email"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { RequestCreationService } from "@/lib/services/request-creation.service"
import { DatabaseService, DatabaseSchema, DatabaseRow } from "@/lib/services/database.service"
import { UserRole, CampaignType } from "@prisma/client"
import { renderTemplate } from "@/lib/utils/template-renderer"

/**
 * Categorize email send errors into user-friendly descriptions
 */
function categorizeError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase()
  
  // Authentication/permission errors
  if (msg.includes("unauthorized") || msg.includes("authentication") || msg.includes("auth") || msg.includes("token")) {
    return "Email account authentication error - reconnect your email in Settings"
  }
  
  // Recipient rejection / policy errors
  if (msg.includes("550") || msg.includes("rejected") || msg.includes("refused") || msg.includes("blocked") || msg.includes("policy")) {
    return "Recipient's email server rejected the message (strict email policy)"
  }
  
  // Invalid/non-existent mailbox
  if (msg.includes("mailbox") || msg.includes("user unknown") || msg.includes("does not exist") || msg.includes("invalid") || msg.includes("not found")) {
    return "Email address does not exist or mailbox is unavailable"
  }
  
  // Rate limiting
  if (msg.includes("rate") || msg.includes("limit") || msg.includes("throttle") || msg.includes("too many")) {
    return "Rate limited - too many emails sent recently, will retry"
  }
  
  // Network/timeout
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("enotfound")) {
    return "Network error - email server temporarily unreachable"
  }
  
  // Bounce
  if (msg.includes("bounce") || msg.includes("undeliverable")) {
    return "Email bounced - address may be invalid"
  }
  
  // Generic
  return `Send failed: ${errorMessage.substring(0, 100)}`
}

/**
 * Determine if an error is transient and worth retrying
 */
function isTransientError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase()
  return (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("rate") ||
    msg.includes("limit") ||
    msg.includes("throttle") ||
    msg.includes("too many") ||
    msg.includes("temporary") ||
    msg.includes("try again") ||
    msg.includes("service unavailable") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("429")
  )
}

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

// Month names for parsing
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
]
const MONTH_ABBREVS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
]

/**
 * Parse a period value and extract month and year
 */
function parsePeriodValue(value: string): { month?: number; year: number; quarter?: number } | null {
  const trimmed = value.trim()
  
  // Try "Month YYYY" or "Mon YYYY" format
  const monthYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{4})$/i)
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1].toLowerCase()
    const year = parseInt(monthYearMatch[2])
    let month = MONTH_NAMES.indexOf(monthStr) + 1
    if (month === 0) {
      month = MONTH_ABBREVS.indexOf(monthStr.substring(0, 3)) + 1
    }
    if (month > 0) {
      return { month, year }
    }
  }
  
  // Try "QN YYYY" format
  const quarterMatch = trimmed.match(/^Q([1-4])\s+(\d{4})$/i)
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1])
    const year = parseInt(quarterMatch[2])
    return { year, quarter }
  }
  
  // Try MM/DD/YY or MM/DD/YYYY format
  const dateSlashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dateSlashMatch) {
    const month = parseInt(dateSlashMatch[1])
    let year = parseInt(dateSlashMatch[3])
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year
    }
    if (month >= 1 && month <= 12) {
      return { month, year }
    }
  }
  
  // Try YYYY-MM or YYYY-MM-DD format
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1])
    const month = parseInt(isoMatch[2])
    if (month >= 1 && month <= 12) {
      return { month, year }
    }
  }
  
  // Try full ISO datetime format (e.g., "2026-02-01T00:00:00.000Z")
  const isoDateTimeMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (isoDateTimeMatch) {
    const year = parseInt(isoDateTimeMatch[1])
    const month = parseInt(isoDateTimeMatch[2])
    if (month >= 1 && month <= 12) {
      return { month, year }
    }
  }
  
  return null
}

/**
 * Check if two period values match semantically
 */
function periodsMatch(boardPeriod: string, rowPeriod: string): boolean {
  const board = parsePeriodValue(boardPeriod)
  const row = parsePeriodValue(rowPeriod)
  
  if (!board || !row) {
    return boardPeriod.toLowerCase().trim() === rowPeriod.toLowerCase().trim()
  }
  
  if (board.quarter && row.quarter) {
    return board.year === row.year && board.quarter === row.quarter
  }
  
  if (board.quarter && row.month) {
    const rowQuarter = Math.ceil(row.month / 3)
    return board.year === row.year && board.quarter === rowQuarter
  }
  
  if (row.quarter && board.month) {
    const boardQuarter = Math.ceil(board.month / 3)
    return board.year === row.year && row.quarter === boardQuarter
  }
  
  if (board.month && row.month) {
    return board.year === row.year && board.month === row.month
  }
  
  return board.year === row.year
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
    const userRole = session.user.role || UserRole.MEMBER
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

    const schema = database.schema as unknown as DatabaseSchema
    const allRows = database.rows as unknown as DatabaseRow[]

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
      filteredRows = allRows.filter(row => {
        const rowPeriod = row[periodColumnKey]
        if (!rowPeriod) return false
        return periodsMatch(boardPeriod, String(rowPeriod))
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
    const recipientEmails = validRows.map(r => normalizeEmail(String(r[emailColumnKey])) || "")
    const existingEntities = await prisma.entity.findMany({
      where: { organizationId, email: { in: recipientEmails, mode: "insensitive" } },
      select: { email: true }
    })
    const existingEmailsSet = new Set(existingEntities.map(e => normalizeEmail(e.email) || ""))

    // Campaign name
    const campaignName = `Database Request: ${instance.name} - ${database.name} - ${new Date().toISOString().split('T')[0]}`

    // Send emails with retry for transient failures
    const results: SendResult[] = []
    let successCount = 0
    let failCount = 0
    const newContacts: { email: string; firstName: string | null; lastName: string | null }[] = []
    const MAX_RETRIES = 2
    const RETRY_DELAY_MS = 1500
    const STAGGER_DELAY_MS = 2000 // 2 seconds between each email to avoid rate limits

    for (let rowIndex = 0; rowIndex < validRows.length; rowIndex++) {
      const row = validRows[rowIndex]

      // Stagger sends: wait between emails to avoid triggering recipient server rate limits
      if (rowIndex > 0 && STAGGER_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS))
      }
      const email = String(row[emailColumnKey])
      const firstName = row[firstNameColumnKey] ? String(row[firstNameColumnKey]) : null

      // Build render data from all row columns
      const renderData: Record<string, string> = { email }
      for (const col of schema.columns) {
        const value = row[col.key]
        renderData[col.key] = value != null ? String(value) : ""
      }

      const subjectResult = renderTemplate(subjectTemplate, renderData)
      const bodyResult = renderTemplate(bodyTemplate, renderData)
      const htmlBody = bodyResult.rendered.replace(/\n/g, '<br>')

      let sent = false
      let lastError: string = ""
      let retriesUsed = 0

      // Retry loop for transient failures (network, rate limit, temporary provider issues)
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
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
            requestType: "data",
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
          sent = true

          // Track new contacts
          if (!existingEmailsSet.has(normalizeEmail(email) || "")) {
            newContacts.push({ email, firstName, lastName: null })
          }
          break // Success - exit retry loop
        } catch (error: any) {
          lastError = error.message || "Unknown error"
          retriesUsed = attempt

          // Categorize the error to decide if retry is worthwhile
          const isTransient = isTransientError(lastError)
          if (isTransient && attempt < MAX_RETRIES) {
            console.warn(`[Database Send] Transient error sending to ${email} (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError}`)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
            continue // Retry
          }
          break // Permanent failure or max retries exhausted
        }
      }

      // If send failed after all retries, create a Request record with SEND_FAILED status
      if (!sent) {
        console.error(`[Database Send] Failed to send to ${email} after ${retriesUsed + 1} attempt(s): ${lastError}`)
        
        try {
          // Create the request record so it shows up in the UI
          const failedRequest = await RequestCreationService.createRequestFromEmail({
            organizationId,
            taskInstanceId,
            entityEmail: email,
            entityName: firstName || undefined,
            campaignName,
            campaignType: CampaignType.CUSTOM as any,
            requestType: "data",
            threadId: `failed-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            replyToEmail: "failed@send",
            subject: subjectResult.rendered,
          })

          // Update the status to SEND_FAILED
          await prisma.request.update({
            where: { id: failedRequest.id },
            data: {
              status: "SEND_FAILED",
              aiReasoning: { error: lastError, retries: retriesUsed, failedAt: new Date().toISOString() }
            }
          })

          results.push({ email, success: false, requestId: failedRequest.id, error: categorizeError(lastError) })
        } catch (createError: any) {
          console.error(`[Database Send] Failed to create failed request record for ${email}:`, createError.message)
          results.push({ email, success: false, error: categorizeError(lastError) })
        }
        failCount++
      }
    }

    // Auto-transition task instance to IN_PROGRESS when emails are sent
    if (successCount > 0) {
      try {
        await TaskInstanceService.markInProgressIfNotStarted(taskInstanceId, organizationId)
      } catch (err: any) {
        console.error("[Database Send] Failed to auto-transition task to IN_PROGRESS:", err.message)
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
      { error: "Failed to send emails" },
      { status: 500 }
    )
  }
}
