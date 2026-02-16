import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthenticated } from "@/lib/auth"
import bcrypt from "bcryptjs"

/**
 * POST /api/companies/[id]/debug-users
 *
 * Creates debug/test login users for each role (ADMIN, MANAGER, MEMBER).
 * Same logic as the signup route's auto-create debug users feature.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgId = params.id

    // Verify org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // Check if debug users already exist
    const existing = await prisma.user.findMany({
      where: { organizationId: orgId, isDebugUser: true },
      select: { id: true, role: true },
    })

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Debug users already exist for this organization", existing },
        { status: 409 }
      )
    }

    const debugPasswordHash = await bcrypt.hash("VergoDebug2026!", 10)
    const debugRoles = ["ADMIN", "MANAGER", "MEMBER"] as const
    const created = []

    for (const role of debugRoles) {
      const user = await prisma.user.create({
        data: {
          email: `debug-${role.toLowerCase()}@${orgId}.vergo.local`,
          passwordHash: debugPasswordHash,
          name: `Debug ${role.charAt(0) + role.slice(1).toLowerCase()}`,
          role,
          organizationId: orgId,
          emailVerified: true,
          isDebugUser: true,
          onboardingCompleted: true,
        },
        select: { id: true, email: true, role: true, name: true },
      })
      created.push(user)
    }

    return NextResponse.json({ success: true, users: created }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating debug users:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to create debug users" },
      { status: 500 }
    )
  }
}
