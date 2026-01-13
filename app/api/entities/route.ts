import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EntityService } from "@/lib/services/entity.service"
import { DomainDetectionService } from "@/lib/services/domain-detection.service"
import { ContactStateService } from "@/lib/services/contact-state.service"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search")
  const groupId = searchParams.get("groupId")
  const contactType = searchParams.get("contactType") || undefined
  const stateKey = searchParams.get("stateKey") || undefined
  const stateKeysParam = searchParams.get("stateKeys")
  const stateKeys = stateKeysParam ? stateKeysParam.split(",").filter(Boolean) : undefined

  const entities = await EntityService.findByOrganization(
    session.user.organizationId,
    {
      search: search || undefined,
      groupId: groupId || undefined,
      contactType,
      stateKey,
      stateKeys
    }
  )

  // Filter out system contacts (used for tag placeholders)
  const filteredEntities = entities.filter(entity => 
    !entity.firstName?.startsWith("__system_") && 
    !entity.email?.startsWith("__system_")
  )

  // Format response with groups and internal/external status
  // findByOrganization already includes groups, but TypeScript doesn't infer it
  const formatted = await Promise.all(filteredEntities.map(async (entity) => {
    const isInternal = entity.email 
      ? await DomainDetectionService.isInternalEmail(entity.email, session.user.organizationId)
      : false

    const entityWithGroups = entity as typeof entity & {
      groups: Array<{ group: { id: string; name: string; color: string | null } }>
      contactStates: Array<{ stateKey: string; metadata: any; updatedAt: Date; source: string }>
    }

    return {
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
    }
  }))

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
    const { firstName, lastName, email, phone, groupIds, contactType, contactTypeCustomLabel } = body

    if (!firstName || !email) {
      return NextResponse.json(
        { error: "firstName and email are required" },
        { status: 400 }
      )
    }

    const entity = await EntityService.create({
      firstName,
      email,
      phone: phone || undefined,
      contactType,
      contactTypeCustomLabel,
      organizationId: session.user.organizationId,
      groupIds: groupIds || []
    })

    // Store lastName as a ContactState if provided
    if (lastName && lastName.trim()) {
      await ContactStateService.upsert({
        entityId: entity.id,
        organizationId: session.user.organizationId,
        stateKey: "lastName",
        metadata: { value: lastName.trim() },
        source: "manual"
      })
    }

    // Fetch with groups
    const entityWithGroups = await EntityService.findById(
      entity.id,
      session.user.organizationId
    )

    if (!entityWithGroups) {
      return NextResponse.json(
        { error: "Failed to fetch created entity" },
        { status: 500 }
      )
    }

    const isInternal = entityWithGroups.email
      ? await DomainDetectionService.isInternalEmail(entityWithGroups.email, session.user.organizationId)
      : false

    const entityWithGroupsTyped = entityWithGroups as typeof entityWithGroups & {
      groups: Array<{ group: { id: string; name: string; color: string | null } }>
    }

    return NextResponse.json({
      id: entityWithGroups.id,
      firstName: entityWithGroups.firstName,
      email: entityWithGroups.email,
      phone: entityWithGroups.phone,
      contactType: entityWithGroups.contactType,
      contactTypeCustomLabel: entityWithGroups.contactTypeCustomLabel,
      isInternal,
      groups: entityWithGroupsTyped.groups.map(eg => ({
        id: eg.group.id,
        name: eg.group.name,
        color: eg.group.color
      })),
      createdAt: entityWithGroups.createdAt,
      updatedAt: entityWithGroups.updatedAt
    }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating entity:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

