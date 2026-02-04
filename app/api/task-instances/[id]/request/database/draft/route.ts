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
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
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
      prompt = `Generate a professional email for a business request. Use the merge fields from the database.

TASK CONTEXT:
- Task Name: ${job.name}
- Description: ${job.description || "Not provided"}
- Due Date: ${job.dueDate ? job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "Not set"}
- Labels: ${jobLabels.length > 0 ? jobLabels.join(', ') : "None"}

DATABASE CONTEXT:
- Database Name: ${databaseName}
- This database likely contains ${databaseName.toLowerCase()} data

AVAILABLE MERGE FIELDS FROM DATABASE:
${columns.map(col => {
  const samples = columnSamples[col.key]
  return `- {{${col.key}}} (${col.label}, ${col.dataType})${samples.length > 0 ? ` - Examples: ${samples.slice(0, 2).join(', ')}` : ''}`
}).join('\n')}

${userGoal ? `USER'S SPECIFIC GOAL: ${userGoal}` : ''}

CRITICAL REQUIREMENTS:
1. Use relevant merge fields from the database in the email body
2. Use {{column_key}} syntax exactly as shown above
3. ${nameColumn ? `Start with "Dear {{${nameColumn.key}}}," for personalization` : 'Start with an appropriate professional greeting'}
4. Reference the task name "${job.name}" and database context "${databaseName}" to create a contextually relevant email
5. For data fields like amounts, dates, or numbers, write sentences that naturally incorporate them
6. Be professional and include a clear call-to-action
7. Keep the email concise but complete

Generate an email that makes effective use of the available merge fields.`
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
      { error: "Failed to generate draft", message: error.message },
      { status: 500 }
    )
  }
}
