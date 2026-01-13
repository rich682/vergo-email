import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Reserved tag names that cannot be created
const RESERVED_TAGS = new Set([
  "firstname", "first_name", "lastname", "last_name",
  "email", "phone", "type", "groups", "contacttype", "contact_type"
])

// POST - Create a new tag (creates an empty placeholder entry)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tagName } = body

    if (!tagName || typeof tagName !== "string" || !tagName.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 })
    }

    // Normalize: lowercase, replace spaces with underscores
    const normalizedName = tagName.trim().toLowerCase().replace(/\s+/g, "_")

    // Check reserved names
    if (RESERVED_TAGS.has(normalizedName)) {
      return NextResponse.json({ error: "This tag name is reserved" }, { status: 400 })
    }

    // Check if tag already exists
    const existing = await prisma.contactState.findFirst({
      where: {
        organizationId: session.user.organizationId,
        stateKey: normalizedName
      }
    })

    if (existing) {
      return NextResponse.json({ error: "This tag already exists" }, { status: 400 })
    }

    // Create a placeholder entry with a special system entity to make the tag visible
    // This allows users to create tags before assigning values to contacts
    // We use a special "__tag_placeholder__" entityId to mark these entries
    await prisma.contactState.create({
      data: {
        organizationId: session.user.organizationId,
        entityId: `__tag_placeholder__${normalizedName}`,
        stateKey: normalizedName,
        stateValue: "__placeholder__"
      }
    })

    return NextResponse.json({ 
      success: true, 
      tagName: normalizedName,
      message: "Tag created successfully"
    })
  } catch (error: any) {
    console.error("Error creating tag:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a tag from all contacts
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const tagName = searchParams.get("tagName")

    if (!tagName) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 })
    }

    // Delete all ContactState entries with this stateKey
    const result = await prisma.contactState.deleteMany({
      where: {
        organizationId: session.user.organizationId,
        stateKey: tagName
      }
    })

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.count 
    })
  } catch (error: any) {
    console.error("Error deleting tag:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
