import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthenticated } from "@/lib/auth"

const VALID_STATUSES = ["FREE_TRIAL", "TRIAL_ENDED", "PAYING_CUSTOMER"] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { status } = await request.json()

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "status must be one of: FREE_TRIAL, TRIAL_ENDED, PAYING_CUSTOMER" },
        { status: 400 }
      )
    }

    const org = await prisma.organization.findUnique({
      where: { id: params.id },
      select: { id: true },
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    const updated = await prisma.organization.update({
      where: { id: params.id },
      data: { subscriptionStatus: status },
      select: { subscriptionStatus: true },
    })

    return NextResponse.json({ success: true, subscriptionStatus: updated.subscriptionStatus })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
