import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection/preview/[id]
 * Preview a collected item - redirects to the file URL
 * 
 * Vercel Blob URLs are publicly accessible and should work in iframes
 */
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const itemId = context.params.id
  
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId

    // Fetch the collected item
    const item = await prisma.collectedItem.findFirst({
      where: {
        id: itemId,
        organizationId
      }
    })

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // If we have a fileUrl, redirect to it
    if (item.fileUrl) {
      return NextResponse.redirect(item.fileUrl)
    }

    // No fileUrl available
    return NextResponse.json(
      { error: "File URL not available" },
      { status: 404 }
    )
  } catch (error: any) {
    console.error("[Preview API] Error:", error)
    return NextResponse.json(
      { error: "Failed to preview file", message: error.message },
      { status: 500 }
    )
  }
}
