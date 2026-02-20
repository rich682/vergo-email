/**
 * Form Request Task Summaries API
 *
 * GET /api/form-requests/tasks
 * Returns task instances that have form requests, grouped by (taskInstanceId + formDefinitionId)
 * with summary counts (total, submitted, pending, expired).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "forms:view_submissions", session.user.orgActionPermissions)) {
      return NextResponse.json({ tasks: [] })
    }

    const orgId = session.user.organizationId
    const { searchParams } = new URL(request.url)
    const boardIdFilter = searchParams.get("boardId") || undefined
    const canViewAll = canPerformAction(session.user.role, "forms:view_all_templates", session.user.orgActionPermissions)

    // Users without view_all_templates only see forms they are viewers of or created
    let formIdFilter: { in: string[] } | undefined = undefined
    if (!canViewAll) {
      const [viewerEntries, createdForms] = await Promise.all([
        prisma.formDefinitionViewer.findMany({
          where: { userId: session.user.id },
          select: { formDefinitionId: true },
        }),
        prisma.formDefinition.findMany({
          where: { createdById: session.user.id, organizationId: orgId },
          select: { id: true },
        }),
      ])
      const viewerIds = viewerEntries.map(v => v.formDefinitionId)
      const createdIds = createdForms.map(f => f.id)
      formIdFilter = { in: [...new Set([...viewerIds, ...createdIds])] }
    }

    // If filtering by board, get task IDs in that board first
    let boardTaskIdFilter: { in: string[] } | undefined = undefined
    if (boardIdFilter) {
      const boardTasks = await prisma.taskInstance.findMany({
        where: { organizationId: orgId, boardId: boardIdFilter },
        select: { id: true },
      })
      boardTaskIdFilter = { in: boardTasks.map(t => t.id) }
    }

    // Group form requests by (taskInstanceId, formDefinitionId, status)
    const groups = await prisma.formRequest.groupBy({
      by: ["taskInstanceId", "formDefinitionId", "status"],
      where: {
        organizationId: orgId,
        ...(formIdFilter ? { formDefinitionId: formIdFilter } : {}),
        ...(boardTaskIdFilter ? { taskInstanceId: boardTaskIdFilter } : {}),
      },
      _count: { id: true },
      _max: { createdAt: true },
    })

    // Aggregate into per-(taskInstanceId, formDefinitionId) summaries
    const summaryMap = new Map<string, {
      taskInstanceId: string
      formDefinitionId: string
      total: number
      submitted: number
      pending: number
      expired: number
      latestSentAt: Date | null
    }>()

    for (const group of groups) {
      const key = `${group.taskInstanceId}::${group.formDefinitionId}`
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          taskInstanceId: group.taskInstanceId,
          formDefinitionId: group.formDefinitionId,
          total: 0,
          submitted: 0,
          pending: 0,
          expired: 0,
          latestSentAt: null,
        })
      }
      const entry = summaryMap.get(key)!
      entry.total += group._count.id
      if (group.status === "SUBMITTED") entry.submitted += group._count.id
      else if (group.status === "PENDING") entry.pending += group._count.id
      else if (group.status === "EXPIRED") entry.expired += group._count.id
      if (group._max.createdAt) {
        if (!entry.latestSentAt || group._max.createdAt > entry.latestSentAt) {
          entry.latestSentAt = group._max.createdAt
        }
      }
    }

    const entries = Array.from(summaryMap.values())

    // Fetch related task and form names
    const taskIds = Array.from(new Set(entries.map(s => s.taskInstanceId)))
    const formIds = Array.from(new Set(entries.map(s => s.formDefinitionId)))

    const [tasks, forms] = await Promise.all([
      prisma.taskInstance.findMany({
        where: { id: { in: taskIds }, organizationId: orgId },
        select: { id: true, name: true, board: { select: { id: true, name: true } } },
      }),
      prisma.formDefinition.findMany({
        where: { id: { in: formIds }, organizationId: orgId },
        select: { id: true, name: true },
      }),
    ])

    const taskMap = new Map(tasks.map(t => [t.id, t] as const))
    const formMap = new Map(forms.map(f => [f.id, f] as const))

    const result = entries
      .map(entry => ({
        taskInstanceId: entry.taskInstanceId,
        formDefinitionId: entry.formDefinitionId,
        taskName: taskMap.get(entry.taskInstanceId)?.name || "Unknown Task",
        formName: formMap.get(entry.formDefinitionId)?.name || "Unknown Form",
        total: entry.total,
        submitted: entry.submitted,
        pending: entry.pending,
        expired: entry.expired,
        latestSentAt: entry.latestSentAt?.toISOString() || null,
        taskInstance: taskMap.get(entry.taskInstanceId) || null,
      }))
      .sort((a, b) => {
        const dateA = a.latestSentAt ? new Date(a.latestSentAt).getTime() : 0
        const dateB = b.latestSentAt ? new Date(b.latestSentAt).getTime() : 0
        return dateB - dateA
      })

    return NextResponse.json({ tasks: result })
  } catch (error) {
    console.error("Error listing form request task summaries:", error)
    return NextResponse.json(
      { error: "Failed to list form request task summaries" },
      { status: 500 }
    )
  }
}
