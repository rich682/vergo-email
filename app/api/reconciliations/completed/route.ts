/**
 * Completed Reconciliation Runs API
 *
 * GET /api/reconciliations/completed
 * Returns reconciliation runs with status COMPLETE or REVIEW,
 * including config name, task, board, and summary stats.
 * Excludes large JSON blobs for performance.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:view_runs", session.user.orgActionPermissions)) {
      return NextResponse.json({ runs: [] })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Non-admin users only see runs for configs they are viewers of
    let configIdFilter: { in: string[] } | undefined = undefined
    if (user.role !== "ADMIN") {
      const viewerEntries = await prisma.reconciliationConfigViewer.findMany({
        where: { userId: user.id },
        select: { reconciliationConfigId: true },
      })
      configIdFilter = { in: viewerEntries.map(v => v.reconciliationConfigId) }
    }

    // Optional boardId filter
    const { searchParams } = new URL(request.url)
    const boardIdFilter = searchParams.get("boardId") || undefined

    const runs = await prisma.reconciliationRun.findMany({
      where: {
        organizationId: user.organizationId,
        status: { in: ["COMPLETE", "REVIEW"] },
        ...(configIdFilter ? { configId: configIdFilter } : {}),
        ...(boardIdFilter ? { boardId: boardIdFilter } : {}),
      },
      select: {
        id: true,
        configId: true,
        boardId: true,
        taskInstanceId: true,
        status: true,
        sourceAFileName: true,
        sourceBFileName: true,
        totalSourceA: true,
        totalSourceB: true,
        matchedCount: true,
        exceptionCount: true,
        variance: true,
        completedAt: true,
        completedBy: true,
        createdAt: true,
        updatedAt: true,
        config: {
          select: {
            id: true,
            name: true,
          },
        },
        taskInstance: {
          select: {
            id: true,
            name: true,
            board: {
              select: { id: true, name: true },
            },
          },
        },
        completedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ runs })
  } catch (error) {
    console.error("Error listing completed reconciliation runs:", error)
    return NextResponse.json(
      { error: "Failed to list completed reconciliation runs" },
      { status: 500 }
    )
  }
}
