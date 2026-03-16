/**
 * Organization Tags API
 *
 * GET /api/org/tags - Get all distinct user tags in the organization
 *
 * Authorization: Any authenticated org member
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: { organizationId: session.user.organizationId, isDebugUser: false },
      select: { tags: true },
    })

    // Flatten and deduplicate all tags across users
    const tagSet = new Set<string>()
    for (const user of users) {
      const userTags = user.tags as string[] | null
      if (Array.isArray(userTags)) {
        for (const tag of userTags) {
          if (typeof tag === "string" && tag.trim()) {
            tagSet.add(tag.trim())
          }
        }
      }
    }

    const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({ success: true, tags })
  } catch (error: any) {
    console.error("List org tags error:", error)
    return NextResponse.json({ error: "Failed to list tags" }, { status: 500 })
  }
}
