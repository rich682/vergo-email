/**
 * Custom Status API Endpoint
 *
 * PATCH /api/form-requests/[id]/custom-status - Update the custom/internal status of a form request
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { FormSettings } from "@/lib/types/form"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { customStatus } = body

    if (!customStatus || typeof customStatus !== "string") {
      return NextResponse.json(
        { error: "customStatus is required" },
        { status: 400 }
      )
    }

    // Fetch the form request with its form definition settings
    const formRequest = await prisma.formRequest.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      include: {
        formDefinition: {
          select: {
            settings: true,
          },
        },
      },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    if (formRequest.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Custom status can only be changed for submitted forms" },
        { status: 400 }
      )
    }

    // Validate the custom status is in the allowed list
    const settings = formRequest.formDefinition.settings as unknown as FormSettings | null
    const allowedStatuses = settings?.customStatuses || ["In Progress", "Submitted"]
    if (!allowedStatuses.includes(customStatus)) {
      return NextResponse.json(
        { error: "Invalid custom status" },
        { status: 400 }
      )
    }

    // Update the custom status
    const updated = await prisma.formRequest.update({
      where: { id },
      data: { customStatus },
    })

    return NextResponse.json({
      success: true,
      formRequest: updated,
    })
  } catch (error: any) {
    console.error("Error updating custom status:", error)
    return NextResponse.json(
      { error: "Failed to update custom status" },
      { status: 500 }
    )
  }
}
