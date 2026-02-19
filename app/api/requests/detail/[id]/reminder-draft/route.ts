import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOpenAIClient } from "@/lib/utils/openai-client"

export const maxDuration = 30
export const dynamic = "force-dynamic"


interface ReminderDraft {
  subject: string
  body: string
  htmlBody: string
  reminderNumber: number
  daysSinceSent: number
}

/**
 * POST /api/requests/detail/[id]/reminder-draft
 * Generate an AI-powered reminder email draft that varies from the original
 * 
 * Input: { reminderNumber?: number } (optional, defaults to 1)
 * Output: { subject, body, htmlBody, reminderNumber, daysSinceSent }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const taskId = params.id
    const body = await request.json().catch(() => ({}))
    const reminderNumber = body.reminderNumber || 1

    // Get the request with its original outbound message
    const task = await prisma.request.findFirst({
      where: {
        id: taskId,
        organizationId: session.user.organizationId
      },
      include: {
        entity: true,
        messages: {
          where: { direction: "OUTBOUND" },
          orderBy: { createdAt: "asc" },
          take: 1
        },
        taskInstance: {
          select: {
            name: true,
            description: true,
            dueDate: true
          }
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const originalMessage = task.messages[0]
    if (!originalMessage) {
      return NextResponse.json(
        { error: "No original message found for this task" },
        { status: 400 }
      )
    }

    // Calculate days since original was sent
    const daysSinceSent = Math.floor(
      (Date.now() - new Date(originalMessage.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Get recipient name
    const recipientName = task.entity?.firstName || "there"

    // Get sender info
    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, signature: true }
    })

    const senderName = sender?.name || session.user.name || "The Team"
    const senderSignature = sender?.signature || senderName

    // Generate reminder draft using AI
    const openai = getOpenAIClient()

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that generates professional follow-up/reminder emails.
          
Your task is to create a polite, professional reminder email that:
1. References the original request without repeating it verbatim
2. Varies the tone and wording based on the reminder number
3. Maintains professionalism while adding appropriate urgency
4. Is concise (4-6 lines in body)

Reminder tone guidelines:
- Reminder 1: Friendly check-in, "Just following up..."
- Reminder 2: Polite but more direct, "I wanted to check in again..."
- Reminder 3+: Professional urgency, "This is a gentle reminder that we still need..."

IMPORTANT:
- Do NOT include the sender's signature in your response - it will be appended automatically
- Use proper paragraph formatting with line breaks
- Keep the email brief and to the point
- Reference the original subject/topic but don't repeat the full content

Respond with a JSON object containing:
- subject: string (e.g., "Following up: [Original Subject]" or "Reminder: [Original Subject]")
- body: string (plain text with \\n for line breaks, NO signature)
- htmlBody: string (HTML with <br> for line breaks, NO signature)`
        },
        {
          role: "user",
          content: `Generate reminder #${reminderNumber} for this request:

Original Subject: ${originalMessage.subject || "Request"}
Original Message Preview: ${(originalMessage.body || "").substring(0, 300)}...

Recipient Name: ${recipientName}
Days Since Original Sent: ${daysSinceSent}
${task.taskInstance?.dueDate ? (() => {
            const dateStr = String(task.taskInstance.dueDate)
            const datePart = dateStr.split("T")[0]
            const [y, m, d] = datePart.split("-").map(Number)
            return `Deadline: ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
          })() : ''}

Generate a ${reminderNumber === 1 ? 'friendly' : reminderNumber === 2 ? 'polite but direct' : 'professionally urgent'} reminder email.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(response)

    // Append signature
    const bodyWithSignature = senderSignature
      ? `${parsed.body}\n\n${senderSignature}`
      : parsed.body

    const htmlBodyWithSignature = senderSignature
      ? `${parsed.htmlBody}<br><br>${senderSignature.replace(/\n/g, '<br>')}`
      : parsed.htmlBody

    const draft: ReminderDraft = {
      subject: parsed.subject,
      body: bodyWithSignature,
      htmlBody: htmlBodyWithSignature,
      reminderNumber,
      daysSinceSent
    }

    return NextResponse.json({
      success: true,
      draft
    })
  } catch (error: any) {
    console.error("[API /tasks/[id]/reminder-draft] Error:", error)
    
    // Return a fallback reminder draft
    const fallbackDraft: ReminderDraft = {
      subject: "Following up on my previous request",
      body: `Hi there,\n\nI wanted to follow up on my previous email. Please let me know if you have any questions or need any clarification.\n\nThank you for your attention to this matter.\n\nBest regards`,
      htmlBody: `Hi there,<br><br>I wanted to follow up on my previous email. Please let me know if you have any questions or need any clarification.<br><br>Thank you for your attention to this matter.<br><br>Best regards`,
      reminderNumber: 1,
      daysSinceSent: 0
    }

    return NextResponse.json({
      success: true,
      draft: fallbackDraft,
      fallback: true
    })
  }
}

/**
 * GET /api/requests/detail/[id]/reminder-draft
 * Preview what reminder emails will look like for a task
 * Returns drafts for reminders 1, 2, and 3
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const taskId = params.id

    // Get the request with its original outbound message
    const task = await prisma.request.findFirst({
      where: {
        id: taskId,
        organizationId: session.user.organizationId
      },
      include: {
        entity: true,
        messages: {
          where: { direction: "OUTBOUND" },
          orderBy: { createdAt: "asc" },
          take: 1
        },
        taskInstance: {
          select: {
            name: true,
            description: true,
            dueDate: true
          }
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const originalMessage = task.messages[0]
    if (!originalMessage) {
      return NextResponse.json(
        { error: "No original message found for this task" },
        { status: 400 }
      )
    }

    // Generate preview drafts for reminders 1, 2, and 3
    const openai = getOpenAIClient()
    const recipientName = task.entity?.firstName || "there"
    
    // Get sender info
    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, signature: true }
    })
    const senderSignature = sender?.signature || sender?.name || session.user.name || "The Team"

    const drafts: ReminderDraft[] = []

    for (const reminderNumber of [1, 2, 3]) {
      const daysSinceSent = reminderNumber * 7 // Assume weekly reminders for preview

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that generates professional follow-up/reminder emails.
              
Generate a ${reminderNumber === 1 ? 'friendly' : reminderNumber === 2 ? 'polite but direct' : 'professionally urgent'} reminder.

Respond with JSON: { "subject": "...", "body": "...", "htmlBody": "..." }
- body: plain text with \\n for line breaks, NO signature
- htmlBody: HTML with <br> for line breaks, NO signature
- Keep it brief (4-6 lines)`
            },
            {
              role: "user",
              content: `Reminder #${reminderNumber} for:
Subject: ${originalMessage.subject || "Request"}
Recipient: ${recipientName}
Days since sent: ${daysSinceSent}
${task.taskInstance?.dueDate ? (() => {
                const dateStr = String(task.taskInstance.dueDate)
                const datePart = dateStr.split("T")[0]
                const [y, m, d] = datePart.split("-").map(Number)
                return `Deadline: ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
              })() : ''}`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })

        const response = completion.choices[0]?.message?.content
        if (response) {
          const parsed = JSON.parse(response)
          drafts.push({
            subject: parsed.subject,
            body: `${parsed.body}\n\n${senderSignature}`,
            htmlBody: `${parsed.htmlBody}<br><br>${senderSignature.replace(/\n/g, '<br>')}`,
            reminderNumber,
            daysSinceSent
          })
        }
      } catch (err) {
        // Add fallback for this reminder
        drafts.push({
          subject: `${reminderNumber === 1 ? 'Following up' : reminderNumber === 2 ? 'Checking in again' : 'Reminder'}: ${originalMessage.subject || 'Request'}`,
          body: `Hi ${recipientName},\n\nThis is reminder #${reminderNumber} regarding my previous request. Please let me know if you have any questions.\n\nThank you.\n\n${senderSignature}`,
          htmlBody: `Hi ${recipientName},<br><br>This is reminder #${reminderNumber} regarding my previous request. Please let me know if you have any questions.<br><br>Thank you.<br><br>${senderSignature.replace(/\n/g, '<br>')}`,
          reminderNumber,
          daysSinceSent
        })
      }
    }

    return NextResponse.json({
      success: true,
      originalSubject: originalMessage.subject,
      originalSentAt: originalMessage.createdAt,
      drafts
    })
  } catch (error: any) {
    console.error("[API /tasks/[id]/reminder-draft GET] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate reminder previews" },
      { status: 500 }
    )
  }
}
