import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GroupService } from "@/lib/services/group.service"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const groups = await GroupService.findByOrganization(session.user.organizationId)

  const formatted = groups.map(group => {
    const groupWithEntities = group as typeof group & {
      entities: Array<{ entity: { id: string } }>
    }
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      entityCount: groupWithEntities.entities?.length || 0,
      _count: { entities: groupWithEntities.entities?.length || 0 },
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    }
  })

  return NextResponse.json(formatted)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { name, description, color } = body

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      )
    }

    const group = await GroupService.create({
      name: name.trim(),
      description: description?.trim() || undefined,
      color: color || undefined,
      organizationId: session.user.organizationId
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      entityCount: 0,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating group:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

