import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const group = await prisma.group.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      },
      include: {
        _count: {
          select: { entities: true }
        }
      }
    })

    if (!group) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      entityCount: group._count.entities,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    })
  } catch (error: any) {
    console.error("Error fetching group:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    // Verify group belongs to organization
    const existing = await prisma.group.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      }
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, description, color } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (color !== undefined) updateData.color = color || null

    const group = await prisma.group.update({
      where: { id: params.id },
      data: updateData,
      include: {
        _count: {
          select: { entities: true }
        }
      }
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      entityCount: group._count.entities,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    })
  } catch (error: any) {
    console.error("Error updating group:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    // Verify group belongs to organization
    const existing = await prisma.group.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      }
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      )
    }

    // Delete the group (EntityGroup relations will be cascade deleted)
    await prisma.group.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting group:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
