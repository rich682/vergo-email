import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthenticated } from "@/lib/auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { isTestAccount } = await request.json()

    if (typeof isTestAccount !== "boolean") {
      return NextResponse.json({ error: "isTestAccount must be a boolean" }, { status: 400 })
    }

    const org = await prisma.organization.findUnique({
      where: { id: params.id },
      select: { id: true },
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    await prisma.organization.update({
      where: { id: params.id },
      data: { isTestAccount },
    })

    return NextResponse.json({ success: true, isTestAccount })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
