import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EntityService } from "@/lib/services/entity.service"
import { canPerformAction } from "@/lib/permissions"

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

  const entity = await EntityService.findById(
    params.id,
    session.user.organizationId
  )

  if (!entity) {
    return NextResponse.json(
      { error: "Entity not found" },
      { status: 404 }
    )
  }

  // Type assertion needed because Prisma includes groups but TypeScript doesn't infer it
  const entityWithGroups = entity as typeof entity & {
    groups: Array<{ group: { id: string; name: string; color: string | null } }>
  }

  return NextResponse.json({
    id: entity.id,
    firstName: entity.firstName,
    lastName: entity.lastName,
    email: entity.email,
    phone: entity.phone,
    companyName: entity.companyName,
    contactType: entity.contactType,
    contactTypeCustomLabel: entity.contactTypeCustomLabel,
    isInternal: (entity as any).isInternal ?? false,
    groups: entityWithGroups.groups.map(eg => ({
      id: eg.group.id,
      name: eg.group.name,
      color: eg.group.color
    })),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  })
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

  if (!canPerformAction(session.user.role, "contacts:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "You do not have permission to edit contacts" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { firstName, lastName, email, phone, companyName, groupIds, contactType, contactTypeCustomLabel, isInternal, tagValues } = body

    // Update entity fields (including lastName which is now a proper Entity field)
    const updateData: any = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName || null
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone
    if (companyName !== undefined) updateData.companyName = companyName || null
    if (contactType !== undefined) updateData.contactType = contactType
    if (contactTypeCustomLabel !== undefined) updateData.contactTypeCustomLabel = contactTypeCustomLabel
    if (isInternal !== undefined) updateData.isInternal = isInternal

    if (Object.keys(updateData).length > 0) {
      await EntityService.update(
        params.id,
        session.user.organizationId,
        updateData
      )
    }

    // Update groups if provided
    if (groupIds !== undefined) {
      // Get current entity to find existing groups
      const entity = await EntityService.findById(
        params.id,
        session.user.organizationId
      )

      if (entity) {
        const entityWithGroups = entity as typeof entity & {
          groups: Array<{ group: { id: string } }>
        }
        // Remove all existing groups
        for (const eg of entityWithGroups.groups) {
          await EntityService.removeFromGroup(params.id, eg.group.id)
        }

        // Add new groups
        for (const groupId of groupIds) {
          await EntityService.addToGroup(params.id, groupId)
        }
      }
    }

    // Note: Tag values (ContactState) have been removed.
    // Item-scoped labels (JobLabel/JobContactLabel) are now used instead.

    // Fetch updated entity
    const updated = await EntityService.findById(
      params.id,
      session.user.organizationId
    )

    if (!updated) {
      return NextResponse.json(
        { error: "Entity not found" },
        { status: 404 }
      )
    }

    const updatedWithGroups = updated as typeof updated & {
      groups: Array<{ group: { id: string; name: string; color: string | null } }>
    }

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      companyName: updated.companyName,
      contactType: updated.contactType,
      contactTypeCustomLabel: updated.contactTypeCustomLabel,
      isInternal: (updated as any).isInternal ?? false,
      groups: updatedWithGroups.groups.map(eg => ({
        id: eg.group.id,
        name: eg.group.name,
        color: eg.group.color
      })),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    })
  } catch (error: any) {
    console.error("Error updating entity:", error)
    return NextResponse.json(
      { error: "Internal server error" },
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

  if (!canPerformAction(session.user.role, "contacts:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "You do not have permission to delete contacts" }, { status: 403 })
  }

  try {
    // First verify the entity exists and belongs to this organization
    // This prevents leaking existence of entities in other orgs
    const entity = await EntityService.findById(
      params.id,
      session.user.organizationId
    )

    if (!entity) {
      // Return 404 whether entity doesn't exist or belongs to different org
      // This prevents enumeration attacks
      return NextResponse.json(
        { error: "Entity not found" },
        { status: 404 }
      )
    }

    await EntityService.delete(params.id, session.user.organizationId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting entity:", error)
    // Check for Prisma "record not found" error
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Entity not found" },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/*
 * Manual Verification Steps for Org Scoping:
 * 1. Create entity in Org A, note the ID
 * 2. Switch to Org B (different user/session)
 * 3. Try DELETE /api/entities/{orgA_entity_id}
 * 4. Should return 404, not 500 or success
 * 5. Entity in Org A should still exist
 */

