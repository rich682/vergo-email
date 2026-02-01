import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import OpenAI from "openai"
import { differenceInDays, startOfDay } from "date-fns"
import { parseDateOnlySafe, formatDateOnly } from "@/lib/utils/timezone"

export const dynamic = "force-dynamic"

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    
    let boardId: string | undefined
    try {
      const body = await request.json()
      boardId = body.boardId
    } catch {
    }

    const { taskInstances: instances, total } = await TaskInstanceService.findByOrganization(organizationId, {
      limit: 100,
      boardId
    })

    if (instances.length === 0) {
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

    const today = startOfDay(new Date()) // Today at midnight for consistent day comparisons
    const completedItems = instances.filter(i => i.status === "COMPLETE").length
    const activeItems = instances.filter(i => i.status === "NOT_STARTED" || i.status === "IN_PROGRESS" || i.status === "BLOCKED").length
    
    const atRiskItems: AtRiskItem[] = []
    
    for (const instance of instances) {
      if (instance.status === "COMPLETE") continue
      
      // Use parseDateOnlySafe to avoid timezone shift with date-only fields
      const dueDate = parseDateOnlySafe(instance.dueDate)
      const daysUntilDue = dueDate ? differenceInDays(dueDate, today) : null
      
      let reason: string | null = null
      
      if (daysUntilDue !== null && daysUntilDue < 0) {
        reason = `Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`
      }
      else if (daysUntilDue !== null && daysUntilDue <= 3 && instance.requestCount > 0 && instance.respondedCount === 0) {
        reason = `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} with ${instance.requestCount} outstanding request${instance.requestCount !== 1 ? 's' : ''}`
      }
      else if (daysUntilDue !== null && daysUntilDue <= 7 && instance.requestCount > 0 && instance.respondedCount < instance.requestCount) {
        reason = `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} with ${instance.requestCount - instance.respondedCount} pending response${instance.requestCount - instance.respondedCount !== 1 ? 's' : ''}`
      }
      
      if (reason) {
        atRiskItems.push({
          id: instance.id,
          name: instance.name,
          reason,
          dueDate: formatDateOnly(instance.dueDate),
          daysUntilDue
        })
      }
    }

    atRiskItems.sort((a, b) => {
      if (a.daysUntilDue === null) return 1
      if (b.daysUntilDue === null) return -1
      return a.daysUntilDue - b.daysUntilDue
    })

    const instancesContext = instances.slice(0, 50).map(instance => {
      // Use parseDateOnlySafe for date-only fields
      const dueDate = parseDateOnlySafe(instance.dueDate)
      const daysUntilDue = dueDate ? differenceInDays(dueDate, today) : null
      const labels = instance.labels as any
      
      return {
        name: instance.name,
        status: instance.status,
        dueDate: dueDate ? format(dueDate, "MMM d, yyyy") : "No due date",
        daysUntilDue,
        requestCount: instance.requestCount,
        respondedCount: instance.respondedCount,
        stakeholderCount: instance.stakeholderCount || 0,
        tags: labels?.tags || []
      }
    })

    const openai = getOpenAIClient()
    
    const systemPrompt = `You are an AI assistant helping accountants and professionals manage their tasks. 
Analyze the provided tasks and generate:
1. A brief risk overview (2-3 sentences) highlighting the most critical issues
2. Specific, actionable recommendations (3-5 items)

Be concise and professional. Use specific item names when relevant.`

    const userPrompt = `Analyze these ${instances.length} tasks:

Summary:
- Total items: ${total}
- Completed: ${completedItems}
- Active: ${activeItems}
- At risk: ${atRiskItems.length}

Items at risk:
${atRiskItems.slice(0, 10).map(item => `- "${item.name}": ${item.reason}`).join('\n') || 'None'}

All items:
${JSON.stringify(instancesContext, null, 2)}

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
          atRiskItems: atRiskItems.slice(0, 5),
          recommendations: aiResponse.recommendations || [],
          totalItems: total,
          completedItems,
          activeItems
        }
      })
    } catch (aiError: any) {
      console.error("AI summary generation failed:", aiError)
      
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
