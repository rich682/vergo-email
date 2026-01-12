import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GroupService } from "@/lib/services/group.service"
import { EntityService } from "@/lib/services/entity.service"
import { DomainDetectionService } from "@/lib/services/domain-detection.service"
import { prisma } from "@/lib/prisma"

// Contact types that can be selected as stakeholders
const CONTACT_TYPES = [
  { id: "CLIENT", name: "Clients", description: "External clients" },
  { id: "VENDOR", name: "Vendors", description: "External vendors and suppliers" },
  { id: "EMPLOYEE", name: "Employees", description: "Internal employees" },
  { id: "CONTRACTOR", name: "Contractors", description: "External contractors" },
  { id: "MANAGEMENT", name: "Management", description: "Management team" },
]

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") || ""

  // Get contact type counts for the organization
  const getContactTypeCounts = async () => {
    const counts = await prisma.entity.groupBy({
      by: ["contactType"],
      where: { 
        organizationId: session.user.organizationId,
        email: { not: null }
      },
      _count: { contactType: true }
    })
    
    return CONTACT_TYPES.map(ct => {
      const found = counts.find(c => c.contactType === ct.id)
      return {
        ...ct,
        entityCount: found?._count.contactType || 0
      }
    }).filter(ct => ct.entityCount > 0) // Only show types with contacts
  }

  // Return empty results if no query (for initial load check)
  if (!query || query.trim().length === 0) {
    // Still return groups, entities, and contact types for empty state check
    try {
      const allGroups = await GroupService.findByOrganization(session.user.organizationId)
      const allEntities = await EntityService.findByOrganization(session.user.organizationId)
      const contactTypes = await getContactTypeCounts()
      
      return NextResponse.json({
        contactTypes,
        groups: allGroups.slice(0, 10).map(group => {
          const groupWithEntities = group as typeof group & {
            entities: Array<{ entity: { id: string } }>
          }
          return {
            id: group.id,
            name: group.name,
            entityCount: groupWithEntities.entities?.length || 0,
            color: group.color
          }
        }),
        entities: allEntities.slice(0, 10).map(entity => ({
          id: entity.id,
          firstName: entity.firstName,
          email: entity.email || ""
        }))
      })
    } catch (error: any) {
      return NextResponse.json({
        contactTypes: [],
        groups: [],
        entities: []
      })
    }
  }

  try {
    // Search contact types
    const contactTypes = await getContactTypeCounts()
    const matchingTypes = contactTypes.filter(ct =>
      ct.name.toLowerCase().includes(query.toLowerCase()) ||
      ct.description.toLowerCase().includes(query.toLowerCase())
    )
    
    // Search groups
    const allGroups = await GroupService.findByOrganization(session.user.organizationId)
    const matchingGroups = allGroups
      .filter(group => 
        group.name.toLowerCase().includes(query.toLowerCase()) ||
        (group.description && group.description.toLowerCase().includes(query.toLowerCase()))
      )
      .slice(0, 10)
      .map(group => {
        const groupWithEntities = group as typeof group & {
          entities: Array<{ entity: { id: string } }>
        }
        return {
          id: group.id,
          name: group.name,
          entityCount: groupWithEntities.entities.length,
          color: group.color
        }
      })

    // Search entities
    const matchingEntities = await EntityService.findByOrganization(
      session.user.organizationId,
      { search: query }
    )

    const formattedEntities = await Promise.all(
      matchingEntities.slice(0, 10).map(async (entity) => {
        const isInternal = entity.email
          ? await DomainDetectionService.isInternalEmail(entity.email, session.user.organizationId)
          : false

        return {
          id: entity.id,
          firstName: entity.firstName,
          email: entity.email || "",
          isInternal
        }
      })
    )

    return NextResponse.json({
      contactTypes: matchingTypes,
      groups: matchingGroups,
      entities: formattedEntities
    })
  } catch (error: any) {
    console.error("Error searching recipients:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

