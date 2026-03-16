/**
 * Form Owner API Endpoint
 *
 * PATCH /api/forms/[id]/owner - Change the owner of a form
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "forms:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { newOwnerId } = body

    if (!newOwnerId || typeof newOwnerId !== "string") {
      return NextResponse.json({ error: "newOwnerId is required" }, { status: 400 })
    }

    // Verify form exists and belongs to org
    const form = await prisma.formDefinition.findFirst({
      where: { id, organizationId: session.user.organizationId },
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Verify new owner is in the same org
    const newOwner = await prisma.user.findFirst({
      where: { id: newOwnerId, organizationId: session.user.organizationId },
      select: { id: true, name: true, email: true },
    })

    if (!newOwner) {
      return NextResponse.json({ error: "User not found in organization" }, { status: 404 })
    }

    await prisma.formDefinition.update({
      where: { id },
      data: { createdById: newOwnerId },
    })

    return NextResponse.json({ createdBy: newOwner })
  } catch (error: any) {
    console.error("Error changing form owner:", error)
    return NextResponse.json(
      { error: "Failed to change form owner" },
      { status: 500 }
    )
  }
}
