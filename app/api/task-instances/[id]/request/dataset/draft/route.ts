/**
 * Dataset Draft Generation API Endpoint
 * 
 * POST /api/task-instances/[id]/request/dataset/draft
 * 
 * Generates an AI-drafted email using Item context and dataset schema.
 * Returns subject/body with merge fields and column usage analysis.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { UserRole } from "@prisma/client"
import type { DatasetColumn } from "@/lib/utils/dataset-parser"

interface DraftRequestBody {
  draftId: string
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const { id: jobId } = await params

    // Verify job exists and user has access
    const job = await TaskInstanceService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check edit permission
    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, job, 'edit')
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Parse request body
    const requestBody: DraftRequestBody = await request.json()
    const { draftId, userGoal, currentDraft } = requestBody
    const isRefinement = !!currentDraft

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 }
      )
    }

    // Fetch the EmailDraft
    const emailDraft = await prisma.emailDraft.findFirst({
      where: {
        id: draftId,
        organizationId,
        taskInstanceId: jobId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Extract dataset metadata
    const metadata = emailDraft.suggestedRecipients as any
    if (!metadata || metadata.type !== "dataset") {
      return NextResponse.json(
        { error: "Invalid dataset draft" },
        { status: 400 }
      )
    }

    const columns: DatasetColumn[] = metadata.columns || []
    const availableTags = emailDraft.availableTags as string[] || []

    // Fetch sample rows for AI context
    const sampleData = await prisma.personalizationData.findMany({
      where: { emailDraftId: draftId },
      take: 5,
      orderBy: { createdAt: "asc" }
    })

    // Get user info for signature
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

    // Build sample values for each column
    const columnSamples: Record<string, string[]> = {}
    for (const col of columns) {
      columnSamples[col.key] = []
    }
    
    for (const row of sampleData) {
      const dataJson = row.dataJson as Record<string, string>
      for (const col of columns) {
        const value = dataJson[col.key]
        if (value && columnSamples[col.key].length < 3) {
          columnSamples[col.key].push(value)
        }
      }
    }

    // Build prompt for AI
    const labels = job.labels as any
    const jobLabels = labels?.tags || []

    // Identify name-like columns for greeting
    const nameColumn = columns.find(c => 
      c.key.includes('first_name') || c.key.includes('firstname') || c.key.includes('name')
    )

    let prompt: string
    
    if (isRefinement && currentDraft) {
      // Refinement mode - modify existing draft
      prompt = `You are refining an existing email draft. Apply the user's requested changes while keeping the merge fields intact.

CURRENT DRAFT:
Subject: ${currentDraft.subject}
Body:
${currentDraft.body}

USER'S REFINEMENT REQUEST: ${userGoal}

AVAILABLE MERGE FIELDS (preserve these):
${columns.map(col => `- {{${col.key}}}`).join('\n')}

INSTRUCTIONS:
1. Apply the user's requested changes to the draft
2. Keep ALL existing merge fields ({{field_name}} syntax) - do not remove them
3. Maintain the same general structure unless the user asks for changes
4. Keep the email professional and actionable
5. Return the refined subject and body

Refine the email according to the user's request.`
    } else {
      // Initial generation mode
      prompt = `Generate a professional email for a business request. You MUST use the merge fields provided.

ITEM CONTEXT:
- Item Name: ${job.name}
- Description: ${job.description || "Not provided"}
- Target Date: ${job.dueDate ? job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "Not set"}
- Labels: ${jobLabels.length > 0 ? jobLabels.join(', ') : "None"}

AVAILABLE MERGE FIELDS (YOU MUST USE THESE):
${columns.map(col => {
  const samples = columnSamples[col.key]
  return `- {{${col.key}}} (${col.type})${samples.length > 0 ? ` - Example values: ${samples.slice(0, 2).join(', ')}` : ''}`
}).join('\n')}

${userGoal ? `USER'S SPECIFIC GOAL: ${userGoal}` : ''}

CRITICAL REQUIREMENTS:
1. You MUST include ALL available merge fields in the email body
2. Use {{column_key}} syntax exactly as shown above
3. ${nameColumn ? `Start with "Dear {{${nameColumn.key}}}," for personalization` : 'Start with "Dear Recipient," if no name field available'}
4. For each data field, write a sentence that naturally incorporates it. For example:
   - If there's an invoice_amount field: "The outstanding amount is {{invoice_amount}}."
   - If there's an invoice_due_date field: "Payment is due by {{invoice_due_date}}."
   - If there's an invoice_number field: "This is regarding invoice #{{invoice_number}}."
5. If you cannot naturally incorporate a field into a sentence, list it in a "Details" section:
   
   Details:
   - Invoice Number: {{invoice_number}}
   - Amount: {{invoice_amount}}
   - Due Date: {{invoice_due_date}}

6. Reference the item name "${job.name}" in the subject line
7. Be professional and actionable
8. Include a clear call-to-action

Generate an email that uses EVERY merge field listed above.`
    }

    // Generate draft using AI
    let subject: string
    let body: string
    let usedColumns: string[] = []
    let unusedColumns: string[] = []
    let suggestedMissingColumns: Array<{ name: string; type: string; reason: string }> = []

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
        availableTags
      })

      subject = generated.subjectTemplate || generated.subject
      // Use bodyTemplate for the template, but we need to append signature
      // since bodyTemplate doesn't include it (by design for per-recipient rendering)
      const baseBody = generated.bodyTemplate || generated.body
      // Append signature if not already present
      if (senderSignature && !baseBody.includes(senderSignature)) {
        body = `${baseBody}\n\n${senderSignature}`
      } else {
        body = baseBody
      }

      // Analyze which columns are used in the generated content
      for (const col of columns) {
        const pattern = new RegExp(`\\{\\{\\s*${col.key}\\s*\\}\\}`, 'gi')
        if (pattern.test(subject) || pattern.test(body)) {
          usedColumns.push(col.key)
        } else {
          unusedColumns.push(col.key)
        }
      }

      // Suggest missing columns based on common patterns
      const lowerBody = body.toLowerCase()
      const lowerSubject = subject.toLowerCase()
      
      if (!columns.some(c => c.key.includes('name') || c.key.includes('first'))) {
        suggestedMissingColumns.push({
          name: "first_name",
          type: "text",
          reason: "Personalized greetings improve response rates"
        })
      }

      if ((lowerBody.includes('invoice') || lowerSubject.includes('invoice')) && 
          !columns.some(c => c.key.includes('invoice'))) {
        suggestedMissingColumns.push({
          name: "invoice_number",
          type: "text",
          reason: "Referenced in email but not in dataset"
        })
      }

      if ((lowerBody.includes('amount') || lowerBody.includes('payment')) && 
          !columns.some(c => c.key.includes('amount') || c.key.includes('total'))) {
        suggestedMissingColumns.push({
          name: "amount",
          type: "currency",
          reason: "Payment context detected but no amount column"
        })
      }

    } catch (error: any) {
      console.error("AI draft generation failed, using fallback:", error.message)
      
      // Fallback draft
      const nameField = columns.find(c => 
        c.key.includes('name') || c.key.includes('first')
      )?.key || 'recipient'

      subject = `Request: ${job.name}`
      body = `Dear {{${nameField}}},

I am reaching out regarding ${job.name}.

${job.description || 'Please review the attached information and respond at your earliest convenience.'}

${job.dueDate ? `This is needed by ${job.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` : ''}

Please let me know if you have any questions.

Best regards${senderSignature ? '\n\n' + senderSignature : ''}`

      usedColumns = nameField !== 'recipient' ? [nameField] : []
      unusedColumns = columns.map(c => c.key).filter(k => k !== nameField)
    }

    // Update the EmailDraft with generated content
    await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        generatedSubject: subject,
        generatedBody: body,
        subjectTemplate: subject,
        bodyTemplate: body,
        aiGenerationStatus: "complete"
      }
    })

    return NextResponse.json({
      success: true,
      subject,
      body,
      usedColumns,
      unusedColumns,
      suggestedMissingColumns,
      availableColumns: columns
    })

  } catch (error: any) {
    console.error("Dataset draft generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    )
  }
}
