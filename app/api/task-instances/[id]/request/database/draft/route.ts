/**
 * Database Draft Generation API Endpoint
 * 
 * POST /api/task-instances/[id]/request/database/draft
 * 
 * Generates an AI-drafted email using task context and database schema.
 * Returns subject/body with merge fields.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { DatabaseService, DatabaseSchema } from "@/lib/services/database.service"
import { UserRole } from "@prisma/client"

interface DatabaseColumn {
  key: string
  label: string
  dataType: string
}

interface DraftRequestBody {
  databaseId: string
  databaseName: string
  columns: DatabaseColumn[]
  sampleRows?: Record<string, any>[]
  userGoal?: string
  currentDraft?: {
    subject: string
    body: string
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const { id: jobId } = await params

    // Verify job exists and user has access
    const job = await TaskInstanceService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, job, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Parse request body
    const body: DraftRequestBody = await request.json()
    const { databaseId, databaseName, columns, sampleRows, userGoal, currentDraft } = body
    const isRefinement = !!currentDraft

    if (!databaseId || !columns || columns.length === 0) {
      return NextResponse.json(
        { error: "databaseId and columns are required" },
        { status: 400 }
      )
    }

    // Get user and organization info for signature
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, signature: true }
    })

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    })

    // Build signature
    let senderSignature: string | undefined
    if (user?.signature && user.signature.trim() !== '') {
      senderSignature = user.signature
    } else {
      const signatureParts: string[] = []
      if (user?.name) signatureParts.push(user.name)
      if (organization?.name) signatureParts.push(organization.name)
      if (user?.email) signatureParts.push(user.email)
      senderSignature = signatureParts.length > 0 ? signatureParts.join('\n') : undefined
    }

    // Build sample values for each column from provided sample rows
    const columnSamples: Record<string, string[]> = {}
    for (const col of columns) {
      columnSamples[col.key] = []
    }
    
    if (sampleRows && sampleRows.length > 0) {
      for (const row of sampleRows.slice(0, 5)) {
        for (const col of columns) {
          const value = row[col.key]
          if (value && columnSamples[col.key].length < 3) {
            columnSamples[col.key].push(String(value))
          }
        }
      }
    }

    // Identify name-like columns for greeting
    const nameColumn = columns.find(c =>
      c.key.includes('first_name') || c.key.includes('firstname') ||
      c.key.toLowerCase() === 'name' || c.label.toLowerCase().includes('first name')
    )

    // Identify contact name column (for personalization/greeting)
    const contactNameColumn = !nameColumn ? columns.find(c =>
      c.key === 'contact_name' || c.label.toLowerCase() === 'contact'
    ) : null

    // Classify columns into email-worthy vs internal/system columns
    const INTERNAL_COLUMN_KEYS = new Set([
      'as_of_date', 'remote_id', 'is_overdue', 'days_overdue', 'currency',
      'paid_on_date', 'paid_amount', 'line_id', 'invoice_remote_id',
    ])
    const EMAIL_COLUMN_KEYS = new Set([
      'contact_email', 'email', 'email_address',
    ])
    const NAME_COLUMN_KEYS = new Set([
      'contact_name', 'first_name', 'firstname', 'name', 'last_name', 'lastname',
    ])

    // Split columns: ones to use in email body vs ones to skip
    const emailBodyColumns = columns.filter(c =>
      !INTERNAL_COLUMN_KEYS.has(c.key) &&
      !EMAIL_COLUMN_KEYS.has(c.key) &&
      !NAME_COLUMN_KEYS.has(c.key)
    )

    // Build per-column context with data type awareness and sample values
    const columnDescriptions = emailBodyColumns.map(col => {
      const samples = columnSamples[col.key]
      const sampleStr = samples.length > 0 ? samples[0] : null
      let hint = ''

      // Add formatting/usage guidance based on data type and sample
      if (col.dataType === 'currency') {
        hint = ' [CURRENCY - value already includes number formatting, do NOT add $ or currency symbols]'
        if (sampleStr) hint += ` (example value: ${sampleStr})`
      } else if (col.dataType === 'date') {
        hint = ' [DATE - already formatted]'
        if (sampleStr) hint += ` (example: ${sampleStr})`
      } else if (col.dataType === 'boolean') {
        hint = ' [BOOLEAN - true/false flag, skip unless very relevant]'
      } else if (sampleStr) {
        hint = ` (example: ${sampleStr})`
      }

      return `- {{${col.key}}} = "${col.label}"${hint}`
    }).join('\n')

    // Build dynamic example sentences from actual columns
    const exampleSentences = emailBodyColumns
      .filter(c => c.dataType !== 'boolean')
      .slice(0, 4)
      .map(col => {
        const key = col.key
        const label = col.label.toLowerCase()
        if (col.dataType === 'currency') {
          return `   - "${col.label}": "The ${label} is {{${key}}}."  (NO $ sign — value is pre-formatted)`
        } else if (col.dataType === 'date') {
          return `   - "${col.label}": "The ${label} is {{${key}}}."`
        } else if (label.includes('number') || label.includes('#')) {
          return `   - "${col.label}": "This is regarding ${label.replace('#', '').trim()} #{{${key}}}."`
        } else {
          return `   - "${col.label}": reference {{${key}}} naturally in a sentence`
        }
      }).join('\n')

    // Build job context
    const labels = job.labels as any
    const jobLabels = labels?.tags || []

    let prompt: string

    if (isRefinement && currentDraft) {
      // Refinement mode
      const refinementColumnList = emailBodyColumns.map(col => {
        let hint = ''
        if (col.dataType === 'currency') hint = ' [CURRENCY — do NOT add $ or currency symbols, value is pre-formatted]'
        return `- {{${col.key}}} (${col.label})${hint}`
      }).join('\n')

      prompt = `You are refining an existing email draft. Apply the user's requested changes while keeping the merge fields intact.

CURRENT DRAFT:
Subject: ${currentDraft.subject}
Body:
${currentDraft.body}

USER'S REFINEMENT REQUEST: ${userGoal}

AVAILABLE MERGE FIELDS (preserve these):
${refinementColumnList}

INSTRUCTIONS:
1. Apply the user's requested changes to the draft
2. Keep ALL existing merge fields ({{field_name}} syntax) — do not remove them
3. Maintain the same general structure unless the user asks for changes
4. Keep the email professional and actionable
5. For currency fields: do NOT add $ or currency symbols — values are already formatted (e.g., "4,875.42")
6. Return the refined subject and body

Refine the email according to the user's request.`
    } else {
      // Initial generation mode
      const greetingInstruction = nameColumn
        ? `Start with "Dear {{${nameColumn.key}}}," for personalization`
        : contactNameColumn
          ? `Start with "Dear {{${contactNameColumn.key}}}," for personalization`
          : 'Start with "Dear" followed by an appropriate greeting (e.g., "Dear valued client,")'

      prompt = `Generate a professional, polished email requesting action from recipients.

TASK CONTEXT:
- Task Name: ${job.name}
- Description: ${job.description || "Not provided"}
- Target Date: ${job.dueDate ? job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "Not set"}

DATA CONTEXT:
- Source: ${databaseName}

MERGE FIELDS TO USE IN THE EMAIL BODY (use {{column_key}} syntax exactly):
${columnDescriptions}

${userGoal ? `USER'S SPECIFIC GOAL: ${userGoal}\n` : ''}
CRITICAL REQUIREMENTS:
1. ONLY use merge fields from the list above — do NOT invent fields that aren't listed
2. ${greetingInstruction}
3. Incorporate each relevant field naturally into a sentence. Examples using the ACTUAL fields above:
${exampleSentences}
4. CURRENCY FIELDS: The values are ALREADY formatted numbers (e.g., "4,875.42"). Do NOT prepend a dollar sign or any currency symbol before a merge field. Write "The balance due is {{balance}}." — NEVER put a dollar sign directly before the {{ braces.
5. Do NOT reference the database name, internal systems, or anything that sounds like internal tooling
6. Reference the task "${job.name}" in the subject line
7. Include a clear, specific call-to-action relevant to the data
8. ${job.dueDate ? `Mention the deadline: ${job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Ask for a timely response'}
9. Only include fields that make sense for the recipient to see. Skip internal fields, IDs, or boolean flags that would look strange in an email.
10. Keep it concise — 3-5 sentences in the body, not more.

Generate the email now.`
    }

    // Generate draft using AI
    let subject: string
    let generatedBody: string
    let usedColumns: string[] = []

    try {
      const generated = await AIEmailGenerationService.generateDraft({
        organizationId,
        prompt,
        senderName: user?.name || undefined,
        senderEmail: user?.email || undefined,
        senderCompany: organization?.name || undefined,
        senderSignature,
        deadlineDate: job.dueDate,
        personalizationMode: "csv",
        availableTags: []
      })

      subject = generated.subjectTemplate || generated.subject
      const baseBody = generated.bodyTemplate || generated.body
      
      // Append signature if not already present
      if (senderSignature && !baseBody.includes(senderSignature)) {
        generatedBody = `${baseBody}\n\n${senderSignature}`
      } else {
        generatedBody = baseBody
      }

      // Analyze which columns are used
      for (const col of columns) {
        const pattern = new RegExp(`\\{\\{\\s*${col.key}\\s*\\}\\}`, 'gi')
        if (pattern.test(subject) || pattern.test(generatedBody)) {
          usedColumns.push(col.key)
        }
      }

    } catch (error: any) {
      console.error("AI draft generation failed, using fallback:", error.message)
      
      // Fallback draft
      const nameField = nameColumn?.key || 'recipient'
      const greeting = nameColumn ? `Dear {{${nameField}}},` : 'Hello,'

      subject = `${job.name} - Action Required`
      generatedBody = `${greeting}

I am reaching out regarding ${job.name}.

${job.description || `This request is related to the ${databaseName} in our system.`}

${job.dueDate ? `Please respond by ${job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` : 'Please respond at your earliest convenience.'}

If you have any questions, please don't hesitate to reach out.

Best regards${senderSignature ? '\n\n' + senderSignature : ''}`

      usedColumns = nameColumn ? [nameColumn.key] : []
    }

    return NextResponse.json({
      success: true,
      subject,
      body: generatedBody,
      usedColumns,
      availableColumns: columns
    })

  } catch (error: any) {
    console.error("Database draft generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    )
  }
}
