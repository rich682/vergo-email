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
    const { feature, enabled } = await request.json()

    if (!feature || typeof feature !== "string") {
      return NextResponse.json({ error: "feature is required" }, { status: 400 })
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
    }

    // Fetch current features
    const org = await prisma.organization.findUnique({
      where: { id: params.id },
      select: { features: true },
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    const currentFeatures =
      org.features && typeof org.features === "object"
        ? (org.features as Record<string, boolean>)
        : {}

    // Merge the update
    const updatedFeatures = { ...currentFeatures, [feature]: enabled }

    await prisma.organization.update({
      where: { id: params.id },
      data: { features: updatedFeatures },
    })

    return NextResponse.json({ success: true, features: updatedFeatures })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
