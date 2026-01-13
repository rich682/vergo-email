import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Reserved tag names that cannot be created
const RESERVED_TAGS = new Set([
  "firstname", "first_name", "lastname", "last_name",
  "email", "phone", "type", "groups", "contacttype", "contact_type"
])

// GET - List all tags for the organization
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
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
      success: true,
      tags: tags.map(t => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName || t.name,
        description: t.description,
        contactCount: t._count.contactStates,
        createdAt: t.createdAt.toISOString()
      }))
    })
  } catch (error: any) {
    console.error("Error fetching tags:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

// POST - Create a new tag
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tagName, displayName, description } = body

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
    const existing = await prisma.tag.findUnique({
      where: {
        organizationId_name: {
          organizationId: session.user.organizationId,
          name: normalizedName
        }
      }
    })

    if (existing) {
      return NextResponse.json({ error: "This tag already exists" }, { status: 400 })
    }

    // Create the tag
    const tag = await prisma.tag.create({
      data: {
        organizationId: session.user.organizationId,
        name: normalizedName,
        displayName: displayName || tagName.trim(),
        description: description || null
      }
    })

    return NextResponse.json({ 
      success: true, 
      tag: {
        id: tag.id,
        name: tag.name,
        displayName: tag.displayName,
        description: tag.description
      },
      message: "Tag created successfully"
    })
  } catch (error: any) {
    console.error("Error creating tag:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a tag and all its values from contacts
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const tagId = searchParams.get("tagId")
    const tagName = searchParams.get("tagName") // Support both for backward compatibility

    if (!tagId && !tagName) {
      return NextResponse.json({ error: "Tag ID or name is required" }, { status: 400 })
    }

    // Find the tag
    const tag = tagId 
      ? await prisma.tag.findFirst({
          where: { id: tagId, organizationId: session.user.organizationId }
        })
      : await prisma.tag.findFirst({
          where: { name: tagName!, organizationId: session.user.organizationId }
        })

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 })
    }

    // Delete the tag (cascades to ContactState entries)
    await prisma.tag.delete({
      where: { id: tag.id }
    })

    return NextResponse.json({ 
      success: true, 
      message: "Tag deleted successfully"
    })
  } catch (error: any) {
    console.error("Error deleting tag:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

// PATCH - Update a tag
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tagId, displayName, description } = body

    if (!tagId) {
      return NextResponse.json({ error: "Tag ID is required" }, { status: 400 })
    }

    // Find the tag
    const tag = await prisma.tag.findFirst({
      where: { id: tagId, organizationId: session.user.organizationId }
    })

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 })
    }

    // Update the tag
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: {
        displayName: displayName !== undefined ? displayName : tag.displayName,
        description: description !== undefined ? description : tag.description
      }
    })

    return NextResponse.json({ 
      success: true, 
      tag: {
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName,
        description: updated.description
      }
    })
  } catch (error: any) {
    console.error("Error updating tag:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
