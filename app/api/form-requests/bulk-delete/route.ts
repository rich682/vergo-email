/**
 * Bulk Delete Form Requests
 *
 * POST /api/form-requests/bulk-delete - Hard delete multiple form submissions (admin only)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin } from "@/lib/permissions"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can delete form submissions" }, { status: 403 })
    }

    const { ids } = await request.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 })
    }

    // Verify all belong to this org
    const count = await prisma.formRequest.count({
      where: {
        id: { in: ids },
        organizationId: session.user.organizationId,
      },
    })

    if (count !== ids.length) {
      return NextResponse.json({ error: "Some form requests not found" }, { status: 404 })
    }

    // Clean up activity events
    await prisma.activityEvent.deleteMany({
      where: { formRequestId: { in: ids } },
    })

    // Hard delete — FormAttachments cascade automatically
    const result = await prisma.formRequest.deleteMany({
      where: {
        id: { in: ids },
        organizationId: session.user.organizationId,
      },
    })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error: any) {
    console.error("Error bulk deleting form requests:", error)
    return NextResponse.json(
      { error: "Failed to delete form submissions" },
      { status: 500 }
    )
  }
}
