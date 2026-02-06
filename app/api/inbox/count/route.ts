/**
 * GET /api/inbox/count
 *
 * Lightweight endpoint returning unread and needs-attention counts
 * for the sidebar badge.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getJobAccessFilter } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as string | undefined

    const jobAccessFilter = getJobAccessFilter(userId, userRole)
    const requestBaseFilter: any = {
      organizationId,
      isDraft: false,
      taskInstanceId: { not: null },
      ...(jobAccessFilter ? { taskInstance: jobAccessFilter } : {}),
    }

    // Count unread inbound messages (requests with unread/null readStatus that have inbound replies)
    const unread = await prisma.message.count({
      where: {
        direction: "INBOUND",
        isAutoReply: false,
        request: {
          ...requestBaseFilter,
          readStatus: { in: [null, "unread"] },
        },
      },
    })

    // Count "needs attention": high risk OR low completion with a reply
    const needsAttention = await prisma.request.count({
      where: {
        ...requestBaseFilter,
        OR: [
          { riskLevel: "high" },
          {
            completionPercentage: { lt: 50 },
            readStatus: "replied",
            status: { notIn: ["COMPLETE", "FULFILLED"] },
          },
        ],
        messages: {
          some: {
            direction: "INBOUND",
            isAutoReply: false,
          },
        },
      },
    })

    return NextResponse.json({ unread, needsAttention })
  } catch (error: any) {
    console.error("[Inbox Count] Error:", error?.message)
    return NextResponse.json({ unread: 0, needsAttention: 0 })
  }
}
