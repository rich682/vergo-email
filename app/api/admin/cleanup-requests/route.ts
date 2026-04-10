/**
 * Admin API endpoint to soft-delete all requests/tasks for a clean start.
 * Requests and Messages are soft-deleted (deletedAt set), not permanently removed.
 * Use the trash endpoint to permanently purge if needed.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { prismaWithDeleted } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const orgId = session.user.organizationId
  const userId = session.user.id
  const now = new Date()

  try {
    console.log(`[Cleanup] Starting soft-delete of all requests for org ${orgId} by ${session.user.email}`)

    // Wrap in transaction to prevent partial cleanup
    const result = await prismaWithDeleted.$transaction(async (tx) => {
      // Soft-delete all messages belonging to requests in this org
      const requestIds = await tx.request.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true },
      })
      const ids = requestIds.map((r) => r.id)

      const deletedMessages = await tx.message.updateMany({
        where: { requestId: { in: ids }, deletedAt: null },
        data: { deletedAt: now },
      })

      // Soft-delete all requests for this org
      const deletedRequests = await tx.request.updateMany({
        where: { organizationId: orgId, deletedAt: null },
        data: { deletedAt: now, deletedById: userId },
      })

      // Soft-delete email drafts (these don't have deletedAt yet, so delete normally)
      const deletedDrafts = await tx.emailDraft.deleteMany({
        where: { organizationId: orgId },
      })

      return {
        requests: deletedRequests.count,
        messages: deletedMessages.count,
        emailDrafts: deletedDrafts.count,
      }
    })

    console.log(`[Cleanup] Soft-deleted ${result.requests} requests, ${result.messages} messages, ${result.emailDrafts} drafts for org ${orgId}`)

    return NextResponse.json({
      success: true,
      message: "Cleanup completed — requests and messages soft-deleted (recoverable)",
      deleted: {
        requests: result.requests,
        messages: result.messages,
        emailDrafts: result.emailDrafts,
      },
    })
  } catch (error: any) {
    console.error("[Cleanup] Error:", error)
    return NextResponse.json({ error: "Cleanup failed", message: error.message }, { status: 500 })
  }
}
