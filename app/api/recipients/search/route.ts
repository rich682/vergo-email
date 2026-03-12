import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
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

  // Return empty results if no query (for initial load check)
  if (!query || query.trim().length === 0) {
    try {
      const allEntities = await EntityService.findByOrganization(session.user.organizationId)

      return NextResponse.json({
        contactTypes: [],
        groups: [],
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
      contactTypes: [],
      groups: [],
      entities: formattedEntities
    })
  } catch (error: any) {
    console.error("Error searching recipients:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

