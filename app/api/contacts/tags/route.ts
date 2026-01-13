import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Reserved tag names that cannot be created
const RESERVED_TAGS = new Set([
  "firstname", "first_name", "lastname", "last_name",
  "email", "phone", "type", "groups", "contacttype", "contact_type"
])

// System entity name for holding tag placeholders
const SYSTEM_ENTITY_NAME = "__system_tag_holder__"

// Get or create a system entity for the organization to hold tag placeholders
async function getOrCreateSystemEntity(organizationId: string): Promise<string> {
  // Check if system entity exists
  let systemEntity = await prisma.entity.findFirst({
    where: {
      organizationId,
      firstName: SYSTEM_ENTITY_NAME
    }
  })

  if (!systemEntity) {
    // Create system entity
    systemEntity = await prisma.entity.create({
      data: {
        organizationId,
        firstName: SYSTEM_ENTITY_NAME,
        contactType: "UNKNOWN"
      }
    })
  }

  return systemEntity.id
}

// POST - Create a new tag
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

    // Get or create system entity for this organization
    const systemEntityId = await getOrCreateSystemEntity(session.user.organizationId)

    // Create a placeholder ContactState entry
    await prisma.contactState.create({
      data: {
        organizationId: session.user.organizationId,
        entityId: systemEntityId,
        stateKey: normalizedName,
        source: "CSV_UPLOAD" // Use existing enum value
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
