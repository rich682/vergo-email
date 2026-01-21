/**
 * Task AI Summary Endpoint
 * 
 * POST /api/jobs/[id]/ai-summary - Generate AI summary for a specific task
 * 
 * Analyzes requests, response tracking, and status
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import OpenAI from "openai"
import { differenceInDays, format } from "date-fns"

export const dynamic = "force-dynamic"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

interface RequestRecipient {
  name: string
  email: string
  status: string
  hasReplied?: boolean
  readStatus?: string
}

interface RequestData {
  id: string
  status: string
  sentAt: string | null
  taskCount: number
  recipients: RequestRecipient[]
  reminderConfig?: {
    enabled: boolean
    frequencyHours: number | null
  } | null
}

interface RequestBody {
  jobName: string
  jobStatus: string
  dueDate: string | null
  requests: RequestData[]
  stakeholderCount: number
  taskCount: number
  respondedCount: number
  completedCount: number
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const taskInstanceId = params.id
    const organizationId = session.user.organizationId

    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const body: RequestBody = await request.json()
    const {
      jobName,
      jobStatus,
      dueDate,
      requests,
      stakeholderCount,
      taskCount,
      respondedCount,
      completedCount
    } = body

    const now = new Date()
    const totalRecipients = requests.reduce((sum, r) => sum + r.recipients.length, 0)
    const repliedRecipients = requests.reduce((sum, r) => 
      sum + r.recipients.filter(rec => rec.hasReplied || rec.readStatus === "replied").length, 0
    )
    const pendingRecipients = totalRecipients - repliedRecipients
    const responseRate = totalRecipients > 0 ? Math.round((repliedRecipients / totalRecipients) * 100) : 0

    let daysUntilDue: number | null = null
    if (dueDate) {
      daysUntilDue = differenceInDays(new Date(dueDate), now)
    }

    const urgentItems: string[] = []
    
    if (daysUntilDue !== null && daysUntilDue < 0 && jobStatus !== "COMPLETE") {
      urgentItems.push(`Task is overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`)
    }
    
    if (daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0 && pendingRecipients > 0) {
      urgentItems.push(`${pendingRecipients} recipient${pendingRecipients !== 1 ? 's' : ''} haven't responded with ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} until deadline`)
    }

    if (responseRate < 30 && totalRecipients >= 3) {
      urgentItems.push(`Low response rate (${responseRate}%) - consider sending reminders`)
    }

    const requestsContext = requests.map(r => {
      const sentDate = r.sentAt ? format(new Date(r.sentAt), "MMM d, yyyy") : "Not sent"
      const replied = r.recipients.filter(rec => rec.hasReplied || rec.readStatus === "replied").length
      const pending = r.recipients.length - replied
      const hasReminders = r.reminderConfig?.enabled
      
      return {
        sentDate,
        recipientCount: r.recipients.length,
        replied,
        pending,
        hasReminders,
        recipients: r.recipients.map(rec => ({
          name: rec.name,
          status: rec.status,
          hasReplied: rec.hasReplied || rec.readStatus === "replied"
        }))
      }
    })

    const openai = getOpenAIClient()
    
    const systemPrompt = `You are an AI assistant helping accountants track request status and responses.
Analyze the provided task data and generate a concise summary focusing on:
1. Overall request status and response tracking
2. Any items needing attention
3. Actionable recommendations

Be concise and professional. Focus on what matters most for getting responses.`

    const userPrompt = `Analyze this task:

Task: "${jobName}"
Status: ${jobStatus}
Due Date: ${dueDate ? format(new Date(dueDate), "MMM d, yyyy") : "No deadline"}
${daysUntilDue !== null ? `Days until due: ${daysUntilDue}` : ""}

Request Summary:
- Total requests sent: ${requests.length}
- Total recipients: ${totalRecipients}
- Responses received: ${repliedRecipients} (${responseRate}%)
- Pending responses: ${pendingRecipients}

Request Details:
${JSON.stringify(requestsContext, null, 2)}

Provide a JSON response with:
{
  "overview": "2-3 sentence summary of the current state",
  "requestStatus": "Brief status of requests (e.g., 'All sent, awaiting responses')",
  "responseRate": "Comment on response rate",
  "recommendations": ["Actionable recommendation 1", "Recommendation 2"],
  "urgentItems": ["Urgent item if any"]
}`

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 800
      })

      const aiResponse = JSON.parse(completion.choices[0]?.message?.content || "{}")
      
      const allUrgentItems = [...urgentItems]
      if (aiResponse.urgentItems && Array.isArray(aiResponse.urgentItems)) {
        for (const item of aiResponse.urgentItems) {
          if (!allUrgentItems.includes(item)) {
            allUrgentItems.push(item)
          }
        }
      }

      return NextResponse.json({
        success: true,
        summary: {
          overview: aiResponse.overview || "Unable to generate summary.",
          requestStatus: aiResponse.requestStatus || `${requests.length} request${requests.length !== 1 ? 's' : ''} sent`,
          responseRate: aiResponse.responseRate || `${responseRate}% response rate`,
          recommendations: aiResponse.recommendations || [],
          urgentItems: allUrgentItems
        }
      })
    } catch (aiError: any) {
      console.error("AI summary generation failed:", aiError)
      
      let fallbackOverview = `This task has ${requests.length} request${requests.length !== 1 ? 's' : ''} sent to ${totalRecipients} recipient${totalRecipients !== 1 ? 's' : ''}. `
      
      if (responseRate === 100) {
        fallbackOverview += "All recipients have responded."
      } else if (responseRate > 0) {
        fallbackOverview += `${repliedRecipients} of ${totalRecipients} have responded (${responseRate}%).`
      } else {
        fallbackOverview += "No responses received yet."
      }

      const fallbackRecommendations: string[] = []
      if (pendingRecipients > 0 && responseRate < 50) {
        fallbackRecommendations.push("Consider sending reminder emails to non-responders")
      }
      if (daysUntilDue !== null && daysUntilDue <= 7 && pendingRecipients > 0) {
        fallbackRecommendations.push("Follow up with pending recipients before the deadline")
      }

      return NextResponse.json({
        success: true,
        summary: {
          overview: fallbackOverview,
          requestStatus: `${requests.length} request${requests.length !== 1 ? 's' : ''} sent`,
          responseRate: `${responseRate}% response rate`,
          recommendations: fallbackRecommendations,
          urgentItems
        },
        usedFallback: true
      })
    }

  } catch (error: any) {
    console.error("Task AI summary error:", error)
    return NextResponse.json(
      { error: "Failed to generate summary", message: error.message },
      { status: 500 }
    )
  }
}
