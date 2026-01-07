import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GroupService } from "@/lib/services/group.service"
import { EntityService } from "@/lib/services/entity.service"
import { DomainDetectionService } from "@/lib/services/domain-detection.service"

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

  if (!query || query.trim().length === 0) {
    return NextResponse.json({
      groups: [],
      entities: []
    })
  }

  try {
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

