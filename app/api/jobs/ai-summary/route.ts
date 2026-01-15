/**
 * Jobs AI Summary Endpoint
 * 
 * POST /api/jobs/ai-summary - Generate AI summary of tasks
 * 
 * Returns risk overview, at-risk items, and recommendations
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/lib/services/job.service"
import OpenAI from "openai"
import { differenceInDays, format } from "date-fns"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

interface AtRiskItem {
  id: string
  name: string
  reason: string
  dueDate: string | null
  daysUntilDue: number | null
}

interface AISummaryResponse {
  riskOverview: string
  atRiskItems: AtRiskItem[]
  recommendations: string[]
  totalItems: number
  completedItems: number
  activeItems: number
}

export async function POST(request: NextRequest) {
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

    // Fetch all jobs for the organization
    const { jobs, total } = await JobService.findByOrganization(organizationId, {
      limit: 100 // Get up to 100 jobs for analysis
    })

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          riskOverview: "No tasks to analyze yet. Create your first task to get started.",
          atRiskItems: [],
          recommendations: ["Create your first task to start tracking work."],
          totalItems: 0,
          completedItems: 0,
          activeItems: 0
        }
      })
    }

    // Calculate stats
    const now = new Date()
    const completedItems = jobs.filter(j => j.status === "COMPLETED").length
    const activeItems = jobs.filter(j => j.status === "ACTIVE" || j.status === "WAITING").length
    
    // Identify at-risk items
    const atRiskItems: AtRiskItem[] = []
    
    for (const job of jobs) {
      if (job.status === "COMPLETED" || job.status === "ARCHIVED") continue
      
      const dueDate = job.dueDate ? new Date(job.dueDate) : null
      const daysUntilDue = dueDate ? differenceInDays(dueDate, now) : null
      
      let reason: string | null = null
      
      // Overdue
      if (daysUntilDue !== null && daysUntilDue < 0) {
        reason = `Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`
      }
      // Due within 3 days with no responses
      else if (daysUntilDue !== null && daysUntilDue <= 3 && job.taskCount > 0 && job.respondedCount === 0) {
        reason = `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} with ${job.taskCount} outstanding request${job.taskCount !== 1 ? 's' : ''}`
      }
      // Due within 7 days with outstanding requests
      else if (daysUntilDue !== null && daysUntilDue <= 7 && job.taskCount > 0 && job.respondedCount < job.taskCount) {
        reason = `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} with ${job.taskCount - job.respondedCount} pending response${job.taskCount - job.respondedCount !== 1 ? 's' : ''}`
      }
      
      if (reason) {
        atRiskItems.push({
          id: job.id,
          name: job.name,
          reason,
          dueDate: dueDate ? format(dueDate, "MMM d, yyyy") : null,
          daysUntilDue
        })
      }
    }

    // Sort at-risk items by urgency (most urgent first)
    atRiskItems.sort((a, b) => {
      if (a.daysUntilDue === null) return 1
      if (b.daysUntilDue === null) return -1
      return a.daysUntilDue - b.daysUntilDue
    })

    // Build context for AI
    const jobsContext = jobs.slice(0, 50).map(job => {
      const dueDate = job.dueDate ? new Date(job.dueDate) : null
      const daysUntilDue = dueDate ? differenceInDays(dueDate, now) : null
      const labels = job.labels as any
      
      return {
        name: job.name,
        status: job.status,
        dueDate: dueDate ? format(dueDate, "MMM d, yyyy") : "No due date",
        daysUntilDue,
        taskCount: job.taskCount,
        respondedCount: job.respondedCount,
        stakeholderCount: job.stakeholderCount || 0,
        tags: labels?.tags || []
      }
    })

    // Generate AI summary
    const openai = getOpenAIClient()
    
    const systemPrompt = `You are an AI assistant helping accountants and professionals manage their tasks. 
Analyze the provided tasks and generate:
1. A brief risk overview (2-3 sentences) highlighting the most critical issues
2. Specific, actionable recommendations (3-5 items)

Focus on:
- Items that are overdue or at risk of missing deadlines
- Items with outstanding requests that haven't received responses
- Patterns that might indicate workflow issues
- Suggestions for setting up reminders or following up

Be concise and professional. Use specific item names when relevant.`

    const userPrompt = `Analyze these ${jobs.length} tasks:

Summary:
- Total items: ${total}
- Completed: ${completedItems}
- Active: ${activeItems}
- At risk: ${atRiskItems.length}

Items at risk:
${atRiskItems.slice(0, 10).map(item => `- "${item.name}": ${item.reason}`).join('\n') || 'None'}

All items:
${JSON.stringify(jobsContext, null, 2)}

Provide a JSON response with:
{
  "riskOverview": "Brief 2-3 sentence overview of the current state and main risks",
  "recommendations": ["Recommendation 1", "Recommendation 2", ...]
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
        max_tokens: 1000
      })

      const aiResponse = JSON.parse(completion.choices[0]?.message?.content || "{}")
      
      return NextResponse.json({
        success: true,
        summary: {
          riskOverview: aiResponse.riskOverview || "Unable to generate summary.",
          atRiskItems: atRiskItems.slice(0, 5), // Return top 5 at-risk items
          recommendations: aiResponse.recommendations || [],
          totalItems: total,
          completedItems,
          activeItems
        }
      })
    } catch (aiError: any) {
      console.error("AI summary generation failed:", aiError)
      
      // Return a fallback summary without AI
      const overdueCount = atRiskItems.filter(i => i.daysUntilDue !== null && i.daysUntilDue < 0).length
      const dueSoonCount = atRiskItems.filter(i => i.daysUntilDue !== null && i.daysUntilDue >= 0 && i.daysUntilDue <= 7).length
      
      let fallbackOverview = `You have ${total} tasks. `
      if (overdueCount > 0) {
        fallbackOverview += `${overdueCount} item${overdueCount !== 1 ? 's are' : ' is'} overdue. `
      }
      if (dueSoonCount > 0) {
        fallbackOverview += `${dueSoonCount} item${dueSoonCount !== 1 ? 's are' : ' is'} due within the next 7 days.`
      }
      if (overdueCount === 0 && dueSoonCount === 0) {
        fallbackOverview += "All items appear to be on track."
      }

      return NextResponse.json({
        success: true,
        summary: {
          riskOverview: fallbackOverview,
          atRiskItems: atRiskItems.slice(0, 5),
          recommendations: overdueCount > 0 
            ? ["Review and address overdue items as soon as possible.", "Consider setting up automated reminders for items approaching their due dates."]
            : ["Keep up the good work! Consider reviewing upcoming deadlines."],
          totalItems: total,
          completedItems,
          activeItems
        },
        usedFallback: true
      })
    }

  } catch (error: any) {
    console.error("AI summary error:", error)
    return NextResponse.json(
      { error: "Failed to generate summary", message: error.message },
      { status: 500 }
    )
  }
}
