import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EntityService } from "@/lib/services/entity.service"
import { DomainDetectionService } from "@/lib/services/domain-detection.service"
import { ContactStateService } from "@/lib/services/contact-state.service"

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

  const isInternal = entity.email
    ? await DomainDetectionService.isInternalEmail(entity.email, session.user.organizationId)
    : false

  // Type assertion needed because Prisma includes groups but TypeScript doesn't infer it
    const entityWithGroups = entity as typeof entity & {
      groups: Array<{ group: { id: string; name: string; color: string | null } }>
      contactStates: Array<{ stateKey: string; metadata: any; updatedAt: Date; source: string }>
    }

  return NextResponse.json({
    id: entity.id,
    firstName: entity.firstName,
    email: entity.email,
    phone: entity.phone,
    contactType: entity.contactType,
    contactTypeCustomLabel: entity.contactTypeCustomLabel,
    isInternal,
    groups: entityWithGroups.groups.map(eg => ({
      id: eg.group.id,
      name: eg.group.name,
      color: eg.group.color
    })),
    contactStates: entityWithGroups.contactStates?.map((cs) => ({
      stateKey: cs.stateKey,
      metadata: cs.metadata,
      updatedAt: cs.updatedAt,
      source: cs.source
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

  try {
    const body = await request.json()
    const { firstName, lastName, email, phone, groupIds, contactType, contactTypeCustomLabel } = body

    // Update entity fields
    const updateData: any = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone

    if (contactType !== undefined) updateData.contactType = contactType
    if (contactTypeCustomLabel !== undefined) updateData.contactTypeCustomLabel = contactTypeCustomLabel

    if (Object.keys(updateData).length > 0) {
      await EntityService.update(
        params.id,
        session.user.organizationId,
        updateData
      )
    }

    // Update lastName as ContactState if provided
    if (lastName !== undefined) {
      if (lastName && lastName.trim()) {
        await ContactStateService.upsert({
          entityId: params.id,
          organizationId: session.user.organizationId,
          stateKey: "lastName",
          metadata: { value: lastName.trim() },
          source: "manual"
        })
      } else {
        // If lastName is empty, delete the ContactState
        await ContactStateService.delete(params.id, "lastName")
      }
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

    const isInternal = updated.email
      ? await DomainDetectionService.isInternalEmail(updated.email, session.user.organizationId)
      : false

    const updatedWithGroups = updated as typeof updated & {
      groups: Array<{ group: { id: string; name: string; color: string | null } }>
      contactStates: Array<{ stateKey: string; metadata: any; updatedAt: Date; source: string }>
    }

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      email: updated.email,
      phone: updated.phone,
      contactType: updated.contactType,
      contactTypeCustomLabel: updated.contactTypeCustomLabel,
      isInternal,
      groups: updatedWithGroups.groups.map(eg => ({
        id: eg.group.id,
        name: eg.group.name,
        color: eg.group.color
      })),
      contactStates: updatedWithGroups.contactStates?.map((cs) => ({
        stateKey: cs.stateKey,
        metadata: cs.metadata,
        updatedAt: cs.updatedAt,
        source: cs.source
      })),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    })
  } catch (error: any) {
    console.error("Error updating entity:", error)
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
      { error: error.message || "Internal server error" },
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

