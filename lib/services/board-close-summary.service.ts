/**
 * Board Close Summary Service
 * Generates AI-powered retrospective analysis of closed accounting periods.
 * Identifies what delayed the close, which tasks missed target dates, and provides
 * recommendations for faster closes in the future.
 */

import { prisma } from "@/lib/prisma"
import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import { differenceInDays } from "date-fns"

export interface CloseSummary {
  closeSpeed: "early" | "on_time" | "late"
  daysToClose: number
  periodDays: number
  totalTasks: number
  blockerTasks: Array<{ name: string; status: string; daysInProgress: number }>
  lateTasks: Array<{ name: string; completedDaysAfterTarget: number }>
  missedTargetTasks: Array<{ name: string; targetDate: string; completedAt: string; daysLate: number }>
  aiInsights: string[]
  aiRecommendations: string[]
}

export interface CloseSummaryInput {
  boardId: string
  organizationId: string
}

export class BoardCloseSummaryService {
  /**
   * Generate a close retrospective summary for a completed board
   */
  static async generateCloseSummary(input: CloseSummaryInput): Promise<{ summary: CloseSummary }> {
    const board = await prisma.board.findFirst({
      where: {
        id: input.boardId,
        organizationId: input.organizationId,
      },
      include: {
        taskInstances: {
          select: {
            id: true,
            name: true,
            status: true,
            dueDate: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })

    if (!board) {
      throw new Error("Board not found")
    }

    if (!["CLOSED", "COMPLETE"].includes(board.status)) {
      throw new Error("Board is not closed")
    }

    const tasks = board.taskInstances
    const totalTasks = tasks.length

    // Calculate close speed
    const periodStart = board.periodStart
    const periodEnd = board.periodEnd
    const closedAt = board.closedAt

    let closeSpeed: "early" | "on_time" | "late" = "on_time"
    let daysToClose = 0
    let periodDays = 0

    if (periodStart && periodEnd) {
      periodDays = differenceInDays(periodEnd, periodStart)

      if (closedAt) {
        daysToClose = differenceInDays(closedAt, periodStart)
        if (closedAt <= periodEnd) {
          closeSpeed = "early"
        } else {
          closeSpeed = "late"
        }
      } else {
        // Legacy board without closedAt — use updatedAt as proxy
        daysToClose = differenceInDays(board.updatedAt, periodStart)
        closeSpeed = board.updatedAt <= periodEnd ? "early" : "late"
      }
    }

    // Find blocker tasks — tasks that took the longest or were still in progress/blocked
    const blockerTasks = tasks
      .filter((t) => {
        const status = t.status.toUpperCase()
        return status === "IN_PROGRESS" || status === "BLOCKED" || status === "WAITING"
      })
      .map((t) => {
        const endTime = t.completedAt || board.closedAt || board.updatedAt
        const daysInProgress = differenceInDays(endTime, t.createdAt)
        return {
          name: t.name,
          status: t.status,
          daysInProgress: Math.max(0, daysInProgress),
        }
      })
      .sort((a, b) => b.daysInProgress - a.daysInProgress)
      .slice(0, 5)

    // Also include completed tasks that took a long time
    const completedTasksByDuration = tasks
      .filter((t) => {
        const status = t.status.toUpperCase()
        return status === "COMPLETE" || status === "COMPLETED"
      })
      .map((t) => {
        const endTime = t.completedAt || t.updatedAt
        const daysInProgress = differenceInDays(endTime, t.createdAt)
        return {
          name: t.name,
          status: t.status,
          daysInProgress: Math.max(0, daysInProgress),
        }
      })
      .sort((a, b) => b.daysInProgress - a.daysInProgress)
      .slice(0, 5)

    const allBlockers = [...blockerTasks, ...completedTasksByDuration]
      .sort((a, b) => b.daysInProgress - a.daysInProgress)
      .slice(0, 5)

    // Find tasks that missed their target date
    const missedTargetTasks = tasks
      .filter((t) => {
        if (!t.dueDate) return false
        const endTime = t.completedAt || t.updatedAt
        return endTime > t.dueDate
      })
      .map((t) => {
        const endTime = t.completedAt || t.updatedAt
        const daysLate = differenceInDays(endTime, t.dueDate!)
        return {
          name: t.name,
          targetDate: t.dueDate!.toISOString().split("T")[0],
          completedAt: (t.completedAt || t.updatedAt).toISOString().split("T")[0],
          daysLate: Math.max(0, daysLate),
        }
      })
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 10)

    // Find tasks completed after the period end
    const lateTasks = tasks
      .filter((t) => {
        if (!periodEnd) return false
        const endTime = t.completedAt || t.updatedAt
        const status = t.status.toUpperCase()
        return (status === "COMPLETE" || status === "COMPLETED") && endTime > periodEnd
      })
      .map((t) => {
        const endTime = t.completedAt || t.updatedAt
        const completedDaysAfterTarget = differenceInDays(endTime, periodEnd!)
        return {
          name: t.name,
          completedDaysAfterTarget: Math.max(0, completedDaysAfterTarget),
        }
      })
      .sort((a, b) => b.completedDaysAfterTarget - a.completedDaysAfterTarget)

    // Generate AI insights
    let aiInsights: string[] = []
    let aiRecommendations: string[] = []

    if (totalTasks > 0) {
      try {
        const result = await this.generateAIAnalysis({
          boardName: board.name,
          periodStart: periodStart?.toISOString().split("T")[0] || "",
          periodEnd: periodEnd?.toISOString().split("T")[0] || "",
          closedAt: closedAt?.toISOString().split("T")[0] || board.updatedAt.toISOString().split("T")[0],
          closeSpeed,
          daysToClose,
          periodDays,
          totalTasks,
          completedTasks: tasks.filter((t) => ["COMPLETE", "COMPLETED"].includes(t.status.toUpperCase())).length,
          blockerTasks: allBlockers,
          missedTargetTasks,
          lateTasks,
        })
        aiInsights = result.insights
        aiRecommendations = result.recommendations
      } catch (error: any) {
        console.warn("[BoardCloseSummary] AI analysis failed:", error.message)
        aiInsights = this.generateDeterministicInsights({
          closeSpeed,
          daysToClose,
          totalTasks,
          missedTargetTasks: missedTargetTasks.length,
          lateTasks: lateTasks.length,
        })
      }
    }

    return {
      summary: {
        closeSpeed,
        daysToClose,
        periodDays,
        totalTasks,
        blockerTasks: allBlockers,
        lateTasks,
        missedTargetTasks,
        aiInsights,
        aiRecommendations,
      },
    }
  }

  /**
   * Generate AI-powered close analysis
   */
  private static async generateAIAnalysis(data: {
    boardName: string
    periodStart: string
    periodEnd: string
    closedAt: string
    closeSpeed: string
    daysToClose: number
    periodDays: number
    totalTasks: number
    completedTasks: number
    blockerTasks: Array<{ name: string; status: string; daysInProgress: number }>
    missedTargetTasks: Array<{ name: string; targetDate: string; completedAt: string; daysLate: number }>
    lateTasks: Array<{ name: string; completedDaysAfterTarget: number }>
  }): Promise<{ insights: string[]; recommendations: string[] }> {
    const openai = getOpenAIClient()

    const completion = await callOpenAI(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a book close analyst helping accounting teams improve their close process.
Analyze the close data and identify what delayed this close.
Pay special attention to tasks that missed their target dates — these are systemic bottlenecks.
Be concise, specific, and actionable.

Respond with JSON:
{
  "insights": ["insight 1", "insight 2", "insight 3"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Provide 2-4 insights and 1-3 recommendations.`,
        },
        {
          role: "user",
          content: `Close Analysis for "${data.boardName}"

Period: ${data.periodStart} to ${data.periodEnd}
Closed on: ${data.closedAt}
Close speed: ${data.closeSpeed} (${data.daysToClose} days after period start, ${data.periodDays}-day period)

Tasks: ${data.completedTasks} of ${data.totalTasks} completed

${data.blockerTasks.length > 0 ? `Longest-running tasks:\n${data.blockerTasks.map((t) => `- "${t.name}" (${t.status}, ${t.daysInProgress} days)`).join("\n")}` : "No blocker tasks identified."}

${data.missedTargetTasks.length > 0 ? `Tasks that missed their target date:\n${data.missedTargetTasks.map((t) => `- "${t.name}" — target: ${t.targetDate}, completed: ${t.completedAt} (${t.daysLate} days late)`).join("\n")}` : "All tasks met their target dates."}

${data.lateTasks.length > 0 ? `Tasks completed after period end:\n${data.lateTasks.map((t) => `- "${t.name}" (${t.completedDaysAfterTarget} days after period end)`).join("\n")}` : "All tasks completed within the period."}

Analyze what delayed this close and provide insights + recommendations.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(response)
    return {
      insights: parsed.insights || [],
      recommendations: parsed.recommendations || [],
    }
  }

  /**
   * Fallback deterministic insights when AI is unavailable
   */
  private static generateDeterministicInsights(data: {
    closeSpeed: string
    daysToClose: number
    totalTasks: number
    missedTargetTasks: number
    lateTasks: number
  }): string[] {
    const insights: string[] = []

    if (data.closeSpeed === "late") {
      insights.push(`Books closed ${data.daysToClose} days after period start`)
    } else {
      insights.push(`Books closed within the period (${data.daysToClose} days)`)
    }

    if (data.missedTargetTasks > 0) {
      insights.push(`${data.missedTargetTasks} task${data.missedTargetTasks > 1 ? "s" : ""} missed their target date`)
    }

    if (data.lateTasks > 0) {
      insights.push(`${data.lateTasks} task${data.lateTasks > 1 ? "s" : ""} completed after the period ended`)
    }

    if (insights.length === 0) {
      insights.push(`All ${data.totalTasks} tasks completed on schedule`)
    }

    return insights
  }
}
