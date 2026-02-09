import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/recipients/all
 * 
 * Returns all available recipients for the organization:
 * - Internal users (team members)
 * - External entities/stakeholders
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    // Fetch internal users (team members)
    const users = await prisma.user.findMany({
      where: {
        organizationId: session.user.organizationId,
        email: { not: null as any }
      },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: { name: "asc" }
    })

    // Fetch external entities/stakeholders
    const entities = await prisma.entity.findMany({
      where: {
        organizationId: session.user.organizationId,
        email: { not: null }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        companyName: true,
        contactType: true
      },
      orderBy: { firstName: "asc" }
    })

    // Format and combine recipients
    const recipients = [
      // Internal users
      ...users.map(u => ({
        id: u.id,
        firstName: u.name?.split(" ")[0] || "Unknown",
        lastName: u.name?.split(" ").slice(1).join(" ") || null,
        email: u.email,
        companyName: null,
        type: "user" as const
      })),
      // External entities
      ...entities.map(e => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        companyName: e.companyName,
        type: "entity" as const
      }))
    ]

    return NextResponse.json({ recipients })
  } catch (error: any) {
    console.error("Error fetching all recipients:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
