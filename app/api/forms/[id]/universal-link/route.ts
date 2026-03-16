/**
 * Universal Link API Endpoint
 *
 * POST /api/forms/[id]/universal-link - Toggle universal link for a form
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import crypto from "crypto"

export async function POST(
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
    const { enabled } = body

    // Verify form exists and belongs to org
    const form = await prisma.formDefinition.findFirst({
      where: { id, organizationId: session.user.organizationId },
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    const updateData: any = {
      universalLinkEnabled: Boolean(enabled),
    }

    // Generate token if enabling and no token exists
    if (enabled && !form.universalAccessToken) {
      updateData.universalAccessToken = crypto.randomUUID()
    }

    const updated = await prisma.formDefinition.update({
      where: { id },
      data: updateData,
      select: {
        universalLinkEnabled: true,
        universalAccessToken: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Error toggling universal link:", error)
    return NextResponse.json(
      { error: "Failed to toggle universal link" },
      { status: 500 }
    )
  }
}
