import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/contacts/state-keys
 * 
 * Returns all tags for the organization with contact counts.
 * Now uses the Tag model instead of querying ContactState directly.
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get all tags with contact counts
  const tags = await prisma.tag.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      _count: {
        select: { contactStates: true }
      }
    },
    orderBy: { name: "asc" }
  })

  return NextResponse.json({
    // For backward compatibility with existing code
    stateKeys: tags.map((t) => t.name),
    stateKeysWithCounts: tags.map((t) => ({
      stateKey: t.name,
      count: t._count.contactStates
    })),
    // New format with full tag info
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      displayName: t.displayName || t.name,
      description: t.description,
      contactCount: t._count.contactStates
    }))
  })
}
