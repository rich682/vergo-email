import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

export const dynamic = "force-dynamic"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

interface ReminderPreview {
  subject: string
  body: string
  reminderNumber: number
  tone: string
}

/**
 * POST /api/task-instances/[id]/request/reminder-preview
 * Generate preview of what reminder emails will look like BEFORE sending
 * This is used in the SendRequestModal to show users what reminders will say
 * 
 * Input: { subject: string, body: string, recipientName?: string, reminderDays: number }
 * Output: { drafts: ReminderPreview[] }
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

    const jobId = params.id
    const body = await request.json()
    const { subject, body: emailBody, recipientName, reminderDays } = body

    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      )
    }

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: {
        id: jobId,
        organizationId: session.user.organizationId
      },
      select: {
        id: true,
        name: true,
        dueDate: true
      }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Get sender signature
    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, signature: true }
    })

    const senderName = sender?.name || session.user.name || "The Team"
    const senderSignature = sender?.signature || senderName
    const recipient = recipientName || "{{First Name}}"

    // Generate preview drafts for reminders 1, 2, and 3
    const openai = getOpenAIClient()
    const drafts: ReminderPreview[] = []

    const tones = [
      { number: 1, tone: "friendly", description: "Friendly check-in" },
      { number: 2, tone: "direct", description: "Polite but more direct" },
      { number: 3, tone: "urgent", description: "Professional urgency" }
    ]

    for (const { number, tone, description } of tones) {
      const daysSinceSent = number * (reminderDays || 7)

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an AI assistant that generates professional follow-up/reminder emails.
              
Generate a ${tone} reminder email that:
1. References the original request without repeating it verbatim
2. Is concise (4-6 lines in body)
3. Maintains professionalism

Respond with JSON: { "subject": "...", "body": "..." }
- body: plain text with \\n for line breaks, NO signature (will be appended)
- Keep it brief and professional`
            },
            {
              role: "user",
              content: `Generate reminder #${number} (${description}) for:
Original Subject: ${subject}
Original Body Preview: ${emailBody.substring(0, 300)}...
Recipient: ${recipient}
Days since sent: ${daysSinceSent}
${job.dueDate ? (() => {
                const dateStr = String(job.dueDate)
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
            reminderNumber: number,
            tone: description
          })
        }
      } catch (err) {
        // Add fallback for this reminder
        drafts.push({
          subject: `${number === 1 ? 'Following up' : number === 2 ? 'Checking in again' : 'Reminder'}: ${subject}`,
          body: `Hi ${recipient},\n\nThis is reminder #${number} regarding my previous request. Please let me know if you have any questions.\n\nThank you.\n\n${senderSignature}`,
          reminderNumber: number,
          tone: description
        })
      }
    }

    return NextResponse.json({
      success: true,
      drafts,
      reminderDays: reminderDays || 7
    })
  } catch (error: any) {
    console.error("[API /jobs/[id]/request/reminder-preview] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate reminder previews", message: error.message },
      { status: 500 }
    )
  }
}
