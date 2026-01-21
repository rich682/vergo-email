import { prisma } from "@/lib/prisma"
import { TaskType, JobStatus } from "@prisma/client"

export interface PeriodMetric {
  lineageId: string
  lineageName: string
  currentValue: number
  priorValue: number
  delta: number
  deltaPercentage: number
}

export class AnalyticsService {
  /**
   * Get MoM trends for a specific board (must be COMPLETE)
   */
  static async getBoardAnalytics(boardId: string, organizationId: string) {
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId, status: "COMPLETE" }
    })

    if (!board) {
      throw new Error("Analytics only available for completed periods")
    }

    // Get all table tasks in this board
    const instances = await prisma.taskInstance.findMany({
      where: { boardId, type: TaskType.TABLE },
      include: { lineage: true }
    })

    const metrics: PeriodMetric[] = []

    for (const instance of instances) {
      if (!instance.lineageId || !instance.structuredData) continue

      // Find prior period snapshot
      const prior = await prisma.taskInstance.findFirst({
        where: {
          lineageId: instance.lineageId,
          organizationId,
          isSnapshot: true,
          board: { periodStart: { lt: board.periodStart! } }
        },
        orderBy: { board: { periodStart: "desc" } }
      })

      const currentRows = instance.structuredData as any[]
      const priorRows = (prior?.structuredData as any[]) || []

      // Simple v1 metric: Count of rows or Sum of an 'amount' column if it exists
      const currentVal = currentRows.length
      const priorVal = priorRows.length
      
      metrics.push({
        lineageId: instance.lineageId,
        lineageName: instance.lineage?.name || instance.name,
        currentValue: currentVal,
        priorValue: priorVal,
        delta: currentVal - priorVal,
        deltaPercentage: priorVal === 0 ? 100 : ((currentVal - priorVal) / priorVal) * 100
      })
    }

    return metrics
  }
}
