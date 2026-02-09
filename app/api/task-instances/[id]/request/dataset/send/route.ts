import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
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
  requestId?: string
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
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body: SendRequestBody = await request.json()
    const { draftId, reminderConfig } = body

    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 })
    }

    const emailDraft = await prisma.emailDraft.findFirst({
      where: {
        id: draftId,
        organizationId,
        taskInstanceId,
        personalizationMode: "dataset"
      }
    })

    if (!emailDraft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 })
    }

    if (emailDraft.status === "SENT") {
      return NextResponse.json({ error: "This request has already been sent" }, { status: 400 })
    }

    const subjectTemplate = emailDraft.subjectTemplate || emailDraft.generatedSubject
    const bodyTemplate = emailDraft.bodyTemplate || emailDraft.generatedBody

    if (!subjectTemplate || !bodyTemplate) {
      return NextResponse.json({ error: "Draft content is missing" }, { status: 400 })
    }

    const recipients = await prisma.personalizationData.findMany({
      where: { emailDraftId: draftId },
      orderBy: { recipientEmail: "asc" }
    })

    const validRecipients = recipients.filter(r => isValidEmail(r.recipientEmail))
    if (validRecipients.length === 0) {
      return NextResponse.json({ error: "No valid email addresses in dataset" }, { status: 400 })
    }

    const recipientEmails = validRecipients.map(r => r.recipientEmail.toLowerCase())
    const existingEntities = await prisma.entity.findMany({
      where: { organizationId, email: { in: recipientEmails, mode: "insensitive" } },
      select: { email: true }
    })
    const existingEmailsSet = new Set(existingEntities.map(e => e.email?.toLowerCase()))

    const campaignName = `Dataset Request: ${instance.name} - ${new Date().toISOString().split('T')[0]}`

    const results: SendResult[] = []
    const newContacts: NewContactInfo[] = []
    let successCount = 0
    let failCount = 0

    for (const recipient of validRecipients) {
      const dataJson = recipient.dataJson as Record<string, string>
      const renderData = { ...dataJson, email: recipient.recipientEmail }

      try {
        const subjectResult = renderTemplate(subjectTemplate, renderData)
        const bodyResult = renderTemplate(bodyTemplate, renderData)
        const htmlBody = bodyResult.rendered.replace(/\n/g, '<br>')
        const recipientName = dataJson.first_name || dataJson.name || dataJson.full_name || undefined

        const sendResult = await EmailSendingService.sendEmail({
          organizationId,
          userId,
          jobId: taskInstanceId,
          to: recipient.recipientEmail,
          toName: recipientName,
          subject: subjectResult.rendered,
          body: bodyResult.rendered,
          htmlBody,
          campaignName,
          campaignType: CampaignType.CUSTOM,
          requestType: "data",  // Mark as data personalization request
          deadlineDate: instance.dueDate || undefined,
          remindersConfig: reminderConfig?.enabled ? {
            enabled: true,
            startDelayHours: 24,
            frequencyHours: reminderConfig.frequencyDays ? reminderConfig.frequencyDays * 24 : 168,
            maxCount: reminderConfig.maxCount || 3,
            approved: true
          } : undefined
        })

        await prisma.personalizationData.update({
          where: { id: recipient.id },
          data: {
            renderSubject: subjectResult.rendered,
            renderBody: bodyResult.rendered,
            renderStatus: "ok"
          }
        })

        results.push({ email: recipient.recipientEmail, success: true, requestId: sendResult.taskId })
        successCount++

        if (!existingEmailsSet.has(recipient.recipientEmail.toLowerCase())) {
          newContacts.push({
            email: recipient.recipientEmail,
            name: recipientName || null,
            firstName: dataJson.first_name || dataJson.firstName || dataJson.name?.split(' ')[0] || null,
            lastName: dataJson.last_name || dataJson.lastName || (dataJson.name?.split(' ').slice(1).join(' ')) || null,
            data: dataJson
          })
        }
      } catch (error: any) {
        results.push({ email: recipient.recipientEmail, success: false, error: "Send failed" })
        failCount++
      }
    }

    await prisma.emailDraft.update({
      where: { id: draftId },
      data: { status: "SENT", sentAt: new Date(), suggestedCampaignName: campaignName }
    })

    return NextResponse.json({
      success: true,
      summary: { total: recipients.length, sent: successCount, failed: failCount, skipped: recipients.length - validRecipients.length },
      campaignName,
      results: results.slice(0, 100),
      contactImport: {
        newContacts: newContacts.slice(0, 100),
        newContactCount: newContacts.length,
        existingContactCount: successCount - newContacts.length
      }
    })

  } catch (error: any) {
    console.error("Dataset send error:", error)
    return NextResponse.json(
      { error: "Failed to send emails" },
      { status: 500 }
    )
  }
}
