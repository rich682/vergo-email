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
      },
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error("Error listing tasks:", error)
    return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 })
  }
}
