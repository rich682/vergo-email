/**
 * Form Request API Endpoint
 *
 * DELETE /api/form-requests/[id] - Hard delete a form submission (admin only)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin } from "@/lib/permissions"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can delete form submissions" }, { status: 403 })
    }

    const { id } = await params

    const formRequest = await prisma.formRequest.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    // Clean up related activity events (no cascade relation)
    await prisma.activityEvent.deleteMany({
      where: { formRequestId: id },
    })

    // Hard delete — FormAttachment cascades automatically
    await prisma.formRequest.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting form request:", error)
    return NextResponse.json(
      { error: "Failed to delete form submission" },
      { status: 500 }
    )
  }
}
