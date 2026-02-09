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

    // Build job context
    const labels = job.labels as any
    const jobLabels = labels?.tags || []

    let prompt: string
    
    if (isRefinement && currentDraft) {
      // Refinement mode
      prompt = `You are refining an existing email draft. Apply the user's requested changes while keeping the merge fields intact.

CURRENT DRAFT:
Subject: ${currentDraft.subject}
Body:
${currentDraft.body}

USER'S REFINEMENT REQUEST: ${userGoal}

AVAILABLE MERGE FIELDS (preserve these):
${columns.map(col => `- {{${col.key}}} (${col.label})`).join('\n')}

INSTRUCTIONS:
1. Apply the user's requested changes to the draft
2. Keep ALL existing merge fields ({{field_name}} syntax) - do not remove them
3. Maintain the same general structure unless the user asks for changes
4. Keep the email professional and actionable
5. Return the refined subject and body

Refine the email according to the user's request.`
    } else {
      // Initial generation mode
      // Infer the topic from database name (e.g., "Outstanding Invoices" -> invoices/payments)
      const topicHint = databaseName.toLowerCase()
      
      prompt = `Generate a professional email requesting action from recipients. You MUST use the merge fields provided.

TASK CONTEXT:
- Task Name: ${job.name}
- Description: ${job.description || "Not provided"}
- Due Date: ${job.dueDate ? job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "Not set"}

DATA CONTEXT (use this to understand what the email is about):
- Topic: ${databaseName}
- This email is likely about: ${topicHint}

MERGE FIELDS YOU MUST USE (these will be replaced with actual recipient data):
${columns.map(col => {
  const samples = columnSamples[col.key]
  return `- {{${col.key}}} (${col.label})${samples.length > 0 ? ` - Example: ${samples[0]}` : ''}`
}).join('\n')}

${userGoal ? `USER'S SPECIFIC GOAL: ${userGoal}` : ''}

CRITICAL REQUIREMENTS:
1. YOU MUST include the merge fields in the email body using {{column_key}} syntax exactly
2. ${nameColumn ? `Start with "Dear {{${nameColumn.key}}}," for personalization` : 'Start with "Dear" followed by an appropriate greeting'}
3. For EACH data field, write a sentence that incorporates it naturally:
   - Invoice amount: "The outstanding amount is {{invoice_amount}}."
   - Due date: "Payment is due by {{due_date}}."
   - Invoice number: "This is regarding invoice #{{invoice_number}}."
4. DO NOT literally say "database" or "${databaseName}" in the email text
5. Reference the task "${job.name}" in the subject line
6. Include a clear call-to-action (e.g., "Please review and confirm..." or "Please remit payment by...")
7. ${job.dueDate ? `Mention the deadline: ${job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Ask for a timely response'}

Example structure for an invoice email:
Subject: ${job.name} - Action Required

Dear {{first_name}},

I am reaching out regarding invoice #{{invoice_number}} for {{invoice_amount}}.

The payment is due by {{due_date}}. Please review and let us know if you have any questions.

[signature]

Generate an email using ALL the merge fields listed above.`
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
