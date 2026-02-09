import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type BulkAction = 
  | "add_to_groups" 
  | "remove_from_groups" 
  | "set_type" 
  | "delete"

interface BulkUpdateRequest {
  entityIds: string[]
  action: BulkAction
  payload?: {
    groupIds?: string[]
    contactType?: string
    contactTypeCustomLabel?: string
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  try {
    const body: BulkUpdateRequest = await request.json()
    const { entityIds, action, payload } = body

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json({ error: "entityIds is required" }, { status: 400 })
    }

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 })
    }

    // Verify all entities belong to this organization
    const entities = await prisma.entity.findMany({
      where: {
        id: { in: entityIds },
        organizationId
      },
      select: { id: true }
    })

    const validEntityIds = entities.map(e => e.id)
    if (validEntityIds.length === 0) {
      return NextResponse.json({ error: "No valid entities found" }, { status: 400 })
    }

    let updated = 0
    const errors: Array<{ entityId: string; error: string }> = []

    switch (action) {
      case "add_to_groups": {
        if (!payload?.groupIds || payload.groupIds.length === 0) {
          return NextResponse.json({ error: "groupIds required for add_to_groups" }, { status: 400 })
        }

        // Verify groups belong to organization
        const groups = await prisma.group.findMany({
          where: {
            id: { in: payload.groupIds },
            organizationId
          },
          select: { id: true }
        })
        const validGroupIds = groups.map(g => g.id)

        for (const entityId of validEntityIds) {
          try {
            for (const groupId of validGroupIds) {
              await prisma.entityGroup.upsert({
                where: {
                  entityId_groupId: { entityId, groupId }
                },
                create: { entityId, groupId },
                update: {}
              })
            }
            updated++
          } catch (err: any) {
            errors.push({ entityId, error: err.message })
          }
        }
        break
      }

      case "remove_from_groups": {
        if (!payload?.groupIds || payload.groupIds.length === 0) {
          return NextResponse.json({ error: "groupIds required for remove_from_groups" }, { status: 400 })
        }

        await prisma.entityGroup.deleteMany({
          where: {
            entityId: { in: validEntityIds },
            groupId: { in: payload.groupIds }
          }
        })
        updated = validEntityIds.length
        break
      }

      case "set_type": {
        if (!payload?.contactType) {
          return NextResponse.json({ error: "contactType required for set_type" }, { status: 400 })
        }

        await prisma.entity.updateMany({
          where: {
            id: { in: validEntityIds },
            organizationId
          },
          data: {
            contactType: payload.contactType as any,
            contactTypeCustomLabel: payload.contactTypeCustomLabel || null
          }
        })
        updated = validEntityIds.length
        break
      }

      case "delete": {
        // Delete all related data first
        await prisma.entityGroup.deleteMany({
          where: { entityId: { in: validEntityIds } }
        })

        // Delete entities
        const result = await prisma.entity.deleteMany({
          where: {
            id: { in: validEntityIds },
            organizationId
          }
        })
        updated = result.count
        break
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      updated,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error("Bulk update error:", error)
    return NextResponse.json(
      { error: "Bulk update failed" },
      { status: 500 }
    )
  }
}
