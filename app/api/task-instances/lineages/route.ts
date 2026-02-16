/**
 * Task Lineages API
 *
 * GET /api/task-instances/lineages — List recurring task lineages for the org
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

    const lineages = await prisma.taskLineage.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        instances: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            name: true,
            status: true,
            taskType: true,
          },
        },
      },
    })

    const result = lineages.map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      latestInstance: l.instances[0] || null,
    }))

    return NextResponse.json({ lineages: result })
  } catch (error) {
    console.error("Error listing lineages:", error)
    return NextResponse.json({ error: "Failed to list lineages" }, { status: 500 })
  }
}
