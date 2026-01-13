import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Create a custom type (just validates and returns success - actual type is created when assigning to contact)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { label } = body

    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    const normalizedLabel = label.trim()

    // Check if this custom type already exists
    const existing = await prisma.entity.findFirst({
      where: {
        organizationId: session.user.organizationId,
        contactType: "CUSTOM",
        contactTypeCustomLabel: normalizedLabel
      }
    })

    if (existing) {
      return NextResponse.json({ error: "This custom type already exists" }, { status: 400 })
    }

    // Custom types are created implicitly when assigned to contacts
    // This endpoint just validates the name is available
    return NextResponse.json({ 
      success: true, 
      label: normalizedLabel,
      message: "Custom type name is available. Assign it to a contact to create it."
    })
  } catch (error: any) {
    console.error("Error creating custom type:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a custom type (sets affected contacts to UNKNOWN)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const label = searchParams.get("label")

    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    // Update all contacts with this custom type to UNKNOWN
    const result = await prisma.entity.updateMany({
      where: {
        organizationId: session.user.organizationId,
        contactType: "CUSTOM",
        contactTypeCustomLabel: label
      },
      data: {
        contactType: "UNKNOWN",
        contactTypeCustomLabel: null
      }
    })

    return NextResponse.json({ 
      success: true, 
      updatedCount: result.count 
    })
  } catch (error: any) {
    console.error("Error deleting custom type:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
