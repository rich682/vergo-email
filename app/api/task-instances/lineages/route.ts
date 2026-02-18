/**
 * Task Picker API
 *
 * GET /api/task-instances/lineages — List all tasks for the org (used by agent wizard picker)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tasks = await prisma.taskInstance.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: { not: "ARCHIVED" },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        status: true,
        taskType: true,
        lineageId: true,
        reconciliationConfigId: true,
        reportDefinitionId: true,
        _count: {
          select: {
            requests: { where: { isDraft: false } },
            formRequests: true,
            reconciliationRuns: true,
            generatedReports: true,
          },
        },
        board: {
          select: {
            id: true,
            name: true,
            periodStart: true,
            periodEnd: true,
            cadence: true,
          },
        },
      },
    })

    const mapped = tasks.map((t) => {
      // Determine if the task has existing work the AI can learn from
      const hasExistingWork =
        t.taskType === "request"
          ? t._count.requests > 0
          : t.taskType === "form"
            ? t._count.formRequests > 0
            : t.taskType === "reconciliation"
              ? t._count.reconciliationRuns > 0
              : t.taskType === "report"
                ? t._count.generatedReports > 0 || !!t.reportDefinitionId
                : false

      return {
        id: t.id,
        name: t.name,
        status: t.status,
        taskType: t.taskType,
        lineageId: t.lineageId,
        reconciliationConfigId: t.reconciliationConfigId,
        hasDbRecipients: t._count.requests > 0,
        hasExistingWork,
        board: t.board
          ? {
              id: t.board.id,
              name: t.board.name,
              periodStart: t.board.periodStart,
              periodEnd: t.board.periodEnd,
              cadence: t.board.cadence,
            }
          : null,
      }
    })

    return NextResponse.json({ tasks: mapped })
  } catch (error) {
    console.error("Error listing tasks:", error)
    return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 })
  }
}
