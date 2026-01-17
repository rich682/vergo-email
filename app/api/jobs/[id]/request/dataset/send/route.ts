/**
 * Dataset Send API Endpoint
 * 
 * POST /api/jobs/[id]/request/dataset/send
 * 
 * Sends personalized emails to all valid recipients in the dataset.
 * Creates Tasks for tracking but does not link to Entity records.
 * Returns info about new vs existing contacts for optional import.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JobService } from "@/lib/services/job.service"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { UserRole, CampaignType } from "@prisma/client"
import { renderTemplate } from "@/lib/utils/template-renderer"
import { isValidEmail } from "@/lib/utils/dataset-parser"

interface ReminderConfig {
  enabled: boolean
  frequencyDays?: number
  maxCount?: number
}

interface SendRequestBody {
  draftId: string
  reminderConfig?: ReminderConfig
}

interface SendResult {
  email: string
  success: boolean
  taskId?: string
  error?: string
}

interface NewContactInfo {
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  data: Record<string, string>
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
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: jobId } = await params

    // Verify job exists and user has access
    const job = await JobService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check edit permission
    const canEdit = await JobService.canUserAccessJob(userId, userRole, job, 'edit')
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Parse request body
    const body: SendRequestBody = await request.json()
    const { draftId, reminderConfig } = body

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
        jobId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Check if already sent
    if (emailDraft.status === "SENT") {
      return NextResponse.json(
        { error: "This request has already been sent" },
        { status: 400 }
      )
    }

    // Get subject and body templates
    const subjectTemplate = emailDraft.subjectTemplate || emailDraft.generatedSubject
    const bodyTemplate = emailDraft.bodyTemplate || emailDraft.generatedBody

    if (!subjectTemplate || !bodyTemplate) {
      return NextResponse.json(
        { error: "Draft content is missing. Generate a draft first." },
        { status: 400 }
      )
    }

    // Fetch all recipients
    const recipients = await prisma.personalizationData.findMany({
      where: { emailDraftId: draftId },
      orderBy: { recipientEmail: "asc" }
    })

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients in dataset" },
        { status: 400 }
      )
    }

    // Filter to valid emails only
    const validRecipients = recipients.filter(r => isValidEmail(r.recipientEmail))

    if (validRecipients.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses in dataset" },
        { status: 400 }
      )
    }

    // Check which emails already exist in the contacts database
    const recipientEmails = validRecipients.map(r => r.recipientEmail.toLowerCase())
    const existingEntities = await prisma.entity.findMany({
      where: {
        organizationId,
        email: { in: recipientEmails, mode: "insensitive" }
      },
      select: { email: true }
    })
    const existingEmailsSet = new Set(existingEntities.map(e => e.email?.toLowerCase()))

    // Generate campaign name
    const campaignName = `Dataset Request: ${job.name} - ${new Date().toISOString().split('T')[0]}`

    // Send emails and track new contacts
    const results: SendResult[] = []
    const newContacts: NewContactInfo[] = []
    let successCount = 0
    let failCount = 0

    for (const recipient of validRecipients) {
      const dataJson = recipient.dataJson as Record<string, string>
      
      // Add email to data for potential use
      const renderData = {
        ...dataJson,
        email: recipient.recipientEmail
      }

      try {
        // Render subject and body for this recipient
        const subjectResult = renderTemplate(subjectTemplate, renderData)
        const bodyResult = renderTemplate(bodyTemplate, renderData)

        // Convert body to HTML (simple conversion)
        const htmlBody = bodyResult.rendered
          .replace(/\n/g, '<br>')
          .replace(/\[MISSING: ([^\]]+)\]/g, '<span style="background-color: #fef3c7; padding: 2px 4px;">[$1]</span>')

        // Extract name from data for display
        const recipientName = dataJson.first_name || dataJson.name || dataJson.full_name || undefined

        // Send email with jobId to link task directly to Item
        const sendResult = await EmailSendingService.sendEmail({
          organizationId,
          jobId,  // Link task directly to Item
          to: recipient.recipientEmail,
          toName: recipientName,
          subject: subjectResult.rendered,
          body: bodyResult.rendered,
          htmlBody,
          campaignName,
          campaignType: CampaignType.DOCUMENT_REQUEST,
          deadlineDate: job.dueDate || undefined,
          remindersConfig: reminderConfig?.enabled ? {
            enabled: true,
            startDelayHours: 24,  // Default start delay
            frequencyHours: reminderConfig.frequencyDays ? reminderConfig.frequencyDays * 24 : 168,
            maxCount: reminderConfig.maxCount || 3,
            approved: true
          } : undefined
        })

        // Update PersonalizationData with send status
        await prisma.personalizationData.update({
          where: { id: recipient.id },
          data: {
            renderSubject: subjectResult.rendered,
            renderBody: bodyResult.rendered,
            renderStatus: "ok"
          }
        })

        results.push({
          email: recipient.recipientEmail,
          success: true,
          taskId: sendResult.taskId
        })
        successCount++

        // Track if this is a new contact (not in database)
        if (!existingEmailsSet.has(recipient.recipientEmail.toLowerCase())) {
          const firstName = dataJson.first_name || dataJson.firstName || dataJson.name?.split(' ')[0] || null
          const lastName = dataJson.last_name || dataJson.lastName || 
            (dataJson.name?.split(' ').slice(1).join(' ')) || null
          
          newContacts.push({
            email: recipient.recipientEmail,
            name: recipientName || null,
            firstName,
            lastName,
            data: dataJson
          })
        }

      } catch (error: any) {
        console.error(`Failed to send to ${recipient.recipientEmail}:`, error.message)
        
        results.push({
          email: recipient.recipientEmail,
          success: false,
          error: error.message
        })
        failCount++
      }
    }

    // Update EmailDraft status
    await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        suggestedCampaignName: campaignName
      }
    })

    // Calculate skipped (invalid emails)
    const skippedCount = recipients.length - validRecipients.length

    return NextResponse.json({
      success: true,
      summary: {
        total: recipients.length,
        sent: successCount,
        failed: failCount,
        skipped: skippedCount
      },
      campaignName,
      results: results.slice(0, 100), // Limit results in response
      hasMoreResults: results.length > 100,
      // Contact import info
      contactImport: {
        newContacts: newContacts.slice(0, 100), // Limit for response size
        newContactCount: newContacts.length,
        existingContactCount: successCount - newContacts.length,
        hasMoreNewContacts: newContacts.length > 100
      }
    })

  } catch (error: any) {
    console.error("Dataset send error:", error)
    return NextResponse.json(
      { error: "Failed to send emails", message: error.message },
      { status: 500 }
    )
  }
}
