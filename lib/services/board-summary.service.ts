/**
 * Board Summary Service
 * Generates AI-powered summaries of board status, job completion, and risks.
 */

import { prisma } from "@/lib/prisma"
import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import { differenceInDays } from "date-fns"

export interface BoardSummaryInput {
  boardId: string
  organizationId: string
}

export interface BoardSummary {
  boardName: string
  periodDescription: string | null
  totalJobs: number
  completedJobs: number
  inProgressJobs: number
  notStartedJobs: number
  totalRequests: number
  highRiskRequests: number
  pendingRequests: number
  completedRequests: number
  summaryBullets: string[]
  riskHighlights: Array<{
    requestName: string
    recipientName: string
    riskLevel: string
    riskReason: string | null
  }>
  recommendations: string[]
  generatedAt: Date
}

export class BoardSummaryService {
  /**
   * Generate a summary for a board
   */
  static async generateSummary(input: BoardSummaryInput): Promise<BoardSummary> {
    // Fetch board with related data
    const board = await prisma.board.findFirst({
      where: {
        id: input.boardId,
        organizationId: input.organizationId
      },
      include: {
        taskInstances: {
          select: {
            id: true,
            name: true,
            status: true,
            dueDate: true,
            requests: {
              select: {
                id: true,
                campaignName: true,
                status: true,
                riskLevel: true,
                riskReason: true,
                completionPercentage: true,
                entity: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!board) {
      throw new Error("Board not found")
    }

    // Calculate statistics
    const jobs = board.taskInstances
    const totalJobs = jobs.length
    const completedJobs = jobs.filter(j => j.status === "COMPLETE" || j.status === "COMPLETED").length
    const inProgressJobs = jobs.filter(j => j.status === "IN_PROGRESS" || j.status === "WAITING" || j.status === "ACTIVE").length
    const notStartedJobs = jobs.filter(j => j.status === "NOT_STARTED" || j.status === "BLOCKED").length

    const allRequests = jobs.flatMap(j => j.requests)
    const totalRequests = allRequests.length
    const highRiskRequests = allRequests.filter(r => r.riskLevel === "high" || r.riskLevel === "bounced").length
    const pendingRequests = allRequests.filter(r => 
      r.status === "NO_REPLY" || r.status === "AWAITING_RESPONSE" || r.status === "IN_PROGRESS"
    ).length
    const completedRequests = allRequests.filter(r => 
      r.status === "COMPLETE" || r.status === "FULFILLED" || r.completionPercentage === 100
    ).length

    // Get high-risk request details
    const riskHighlights = allRequests
      .filter(r => r.riskLevel === "high" || r.riskLevel === "bounced")
      .slice(0, 5)
      .map(r => ({
        requestName: r.campaignName || "Untitled",
        recipientName: r.entity 
          ? `${r.entity.firstName} ${r.entity.lastName || ""}`.trim()
          : "Unknown",
        riskLevel: r.riskLevel || "unknown",
        riskReason: r.riskReason
      }))

    // Build period description (parse date part only to avoid timezone shift)
    let periodDescription: string | null = null
    if (board.periodStart) {
      const startDateStr = (board.periodStart as unknown as Date).toISOString?.() || String(board.periodStart)
      const startPart = startDateStr.split("T")[0]
      const [sy, sm, sd] = startPart.split("-").map(Number)
      const start = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
      if (board.periodEnd) {
        const endDateStr = (board.periodEnd as unknown as Date).toISOString?.() || String(board.periodEnd)
        const endPart = endDateStr.split("T")[0]
        const [ey, em, ed] = endPart.split("-").map(Number)
        const end = new Date(ey, em - 1, ed).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        })
        periodDescription = `${start} - ${end}`
      } else {
        periodDescription = `Starting ${start}`
      }
    }

    // Fetch previous period data for context.
    // previousPeriodContext is a plain-text summary of the most recent closed monthly board:
    // close speed (days to close, on-time vs late) and up to 5 tasks that missed their
    // target dates. Passed to the AI prompt so it can flag recurring bottlenecks.
    let previousPeriodContext: string | null = null
    if (board.periodStart && board.cadence === "MONTHLY") {
      try {
        const prevBoard = await prisma.board.findFirst({
          where: {
            organizationId: input.organizationId,
            cadence: "MONTHLY",
            status: { in: ["CLOSED", "COMPLETE"] },
            periodStart: { lt: board.periodStart },
          },
          orderBy: { periodStart: "desc" },
          select: {
            name: true,
            closedAt: true,
            periodEnd: true,
            periodStart: true,
            taskInstances: {
              select: {
                name: true,
                status: true,
                dueDate: true,
                completedAt: true,
                updatedAt: true,
              },
            },
          },
        })

        if (prevBoard) {
          const prevCloseDate = prevBoard.closedAt || prevBoard.periodEnd
          const prevDaysToClose = prevBoard.periodStart && prevCloseDate
            ? differenceInDays(prevCloseDate, prevBoard.periodStart)
            : null
          const prevCloseSpeed = prevBoard.periodEnd && prevCloseDate
            ? (prevCloseDate <= prevBoard.periodEnd ? "on time" : "late")
            : "unknown"

          // Find tasks that missed their target date last month
          const prevMissedTargets = prevBoard.taskInstances
            .filter((t) => {
              if (!t.dueDate) return false
              const endTime = t.completedAt || t.updatedAt
              return endTime > t.dueDate
            })
            .map((t) => {
              const endTime = t.completedAt || t.updatedAt
              const daysLate = differenceInDays(endTime, t.dueDate!)
              return { name: t.name, daysLate: Math.max(0, daysLate) }
            })
            .sort((a, b) => b.daysLate - a.daysLate)
            .slice(0, 5)

          // Build context string
          const parts: string[] = []
          parts.push(`Last month (${prevBoard.name}), books closed ${prevDaysToClose ? `in ${prevDaysToClose} days` : ""} (${prevCloseSpeed}).`)

          if (prevMissedTargets.length > 0) {
            parts.push(`Tasks that missed their target date last month: ${prevMissedTargets.map((t) => `${t.name} (${t.daysLate} days late)`).join(", ")}.`)
          }

          previousPeriodContext = parts.join("\n")
        }
      } catch (error) {
        console.warn("[BoardSummary] Failed to fetch previous period data:", error)
      }
    }

    // Generate AI summary if there's meaningful data
    let summaryBullets: string[] = []
    let recommendations: string[] = []

    if (totalJobs > 0 || totalRequests > 0) {
      try {
        const aiSummary = await this.generateAISummary({
          boardName: board.name,
          periodDescription,
          totalJobs,
          completedJobs,
          inProgressJobs,
          notStartedJobs,
          totalRequests,
          highRiskRequests,
          pendingRequests,
          completedRequests,
          riskHighlights,
          previousPeriodContext,
        })
        summaryBullets = aiSummary.bullets
        recommendations = aiSummary.recommendations
      } catch (error: any) {
        console.warn("[BoardSummary] AI summary failed:", error.message)
        // Fallback to deterministic summary
        summaryBullets = this.generateDeterministicSummary({
          totalJobs,
          completedJobs,
          inProgressJobs,
          highRiskRequests,
          pendingRequests,
          completedRequests
        })
      }
    }

    return {
      boardName: board.name,
      periodDescription,
      totalJobs,
      completedJobs,
      inProgressJobs,
      notStartedJobs,
      totalRequests,
      highRiskRequests,
      pendingRequests,
      completedRequests,
      summaryBullets,
      riskHighlights,
      recommendations,
      generatedAt: new Date()
    }
  }

  /**
   * Generate AI-powered summary bullets and recommendations via GPT-4o-mini.
   * @param data.previousPeriodContext - Optional plain-text snapshot of the prior month's
   *   close speed and missed-target tasks, used to identify recurring bottlenecks.
   */
  static async generateAISummary(data: {
    boardName: string
    periodDescription: string | null
    totalJobs: number
    completedJobs: number
    inProgressJobs: number
    notStartedJobs: number
    totalRequests: number
    highRiskRequests: number
    pendingRequests: number
    completedRequests: number
    riskHighlights: Array<{
      requestName: string
      recipientName: string
      riskLevel: string
      riskReason: string | null
    }>
    previousPeriodContext?: string | null
  }): Promise<{ bullets: string[]; recommendations: string[] }> {
    const openai = getOpenAIClient()

    const previousPeriodInstructions = data.previousPeriodContext
      ? `\nYou also have data from the previous accounting period, including which tasks missed their target dates. Use this to identify recurring bottlenecks. If a task missed its target last month and is at risk this month, call it out.`
      : ""

    const previousPeriodData = data.previousPeriodContext
      ? `\n\nPREVIOUS PERIOD DATA:\n${data.previousPeriodContext}\nCompare current progress against this pattern — flag tasks that consistently miss targets.`
      : ""

    const completion = await callOpenAI(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an accounting assistant summarizing board status for a team. Be concise, professional, and actionable.

Provide:
1. 2-3 summary bullets (key facts about progress and status)
2. 1-2 recommendations (what the team should focus on next)

Focus on:
- Completion progress
- Risk items needing attention
- Blockers or delays${previousPeriodInstructions}

Respond with JSON:
{
  "bullets": ["bullet 1", "bullet 2"],
  "recommendations": ["recommendation 1"]
}`
        },
        {
          role: "user",
          content: `Board: "${data.boardName}"
Period: ${data.periodDescription || "Not specified"}

Jobs:
- Total: ${data.totalJobs}
- Completed: ${data.completedJobs}
- In Progress: ${data.inProgressJobs}
- Not Started: ${data.notStartedJobs}

Requests:
- Total: ${data.totalRequests}
- Completed: ${data.completedRequests}
- Pending: ${data.pendingRequests}
- High Risk: ${data.highRiskRequests}

${data.riskHighlights.length > 0 ? `High Risk Items:\n${data.riskHighlights.map(r => `- ${r.requestName} (${r.recipientName}): ${r.riskReason || r.riskLevel}`).join("\n")}` : "No high-risk items."}${previousPeriodData}

Generate a summary and recommendations.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 400
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(response)
    return {
      bullets: parsed.bullets || [],
      recommendations: parsed.recommendations || []
    }
  }

  /**
   * Generate deterministic summary when AI unavailable
   */
  static generateDeterministicSummary(data: {
    totalJobs: number
    completedJobs: number
    inProgressJobs: number
    highRiskRequests: number
    pendingRequests: number
    completedRequests: number
  }): string[] {
    const bullets: string[] = []

    // Completion progress
    if (data.totalJobs > 0) {
      const completionPct = Math.round((data.completedJobs / data.totalJobs) * 100)
      bullets.push(`${data.completedJobs} of ${data.totalJobs} jobs completed (${completionPct}%)`)
    }

    // Risk status
    if (data.highRiskRequests > 0) {
      bullets.push(`${data.highRiskRequests} high-risk request${data.highRiskRequests > 1 ? "s" : ""} requiring attention`)
    }

    // Pending requests
    if (data.pendingRequests > 0) {
      bullets.push(`${data.pendingRequests} request${data.pendingRequests > 1 ? "s" : ""} awaiting response`)
    }

    if (bullets.length === 0) {
      bullets.push("No activity to summarize")
    }

    return bullets
  }
}
