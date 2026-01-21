/**
 * Board Summary Service
 * Generates AI-powered summaries of board status, job completion, and risks.
 */

import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

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

    // Build period description
    let periodDescription: string | null = null
    if (board.periodStart) {
      const start = new Date(board.periodStart).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
      if (board.periodEnd) {
        const end = new Date(board.periodEnd).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        })
        periodDescription = `${start} - ${end}`
      } else {
        periodDescription = `Starting ${start}`
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
          riskHighlights
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
   * Generate AI-powered summary bullets
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
  }): Promise<{ bullets: string[]; recommendations: string[] }> {
    const openai = getOpenAIClient()

    const completion = await openai.chat.completions.create({
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
- Blockers or delays

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

${data.riskHighlights.length > 0 ? `High Risk Items:\n${data.riskHighlights.map(r => `- ${r.requestName} (${r.recipientName}): ${r.riskReason || r.riskLevel}`).join("\n")}` : "No high-risk items."}

Generate a summary and recommendations.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300
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
