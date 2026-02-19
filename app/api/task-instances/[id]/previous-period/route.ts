import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/task-instances/[id]/previous-period
 *
 * Checks whether a previous-period task instance exists for the same lineage.
 * Used by the in-task agent wizard to gate request-type agent creation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const taskInstance = await prisma.taskInstance.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
    },
    select: { id: true, lineageId: true, dueDate: true },
  })

  if (!taskInstance) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  if (!taskInstance.lineageId) {
    return NextResponse.json({ exists: false, reason: "no_lineage" })
  }

  // Find another task instance with the same lineage, excluding the current one
  const previousTask = await prisma.taskInstance.findFirst({
    where: {
      lineageId: taskInstance.lineageId,
      organizationId: session.user.organizationId,
      id: { not: taskInstance.id },
    },
    orderBy: { dueDate: "desc" },
    select: { id: true, name: true },
  })

  return NextResponse.json({
    exists: !!previousTask,
    previousTask: previousTask || undefined,
  })
}
