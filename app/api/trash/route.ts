/**
 * Trash API — List all soft-deleted items for the organization (admin only)
 *
 * GET /api/trash — Returns grouped list of deleted items
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/permissions"
import { prismaWithDeleted } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can view trash" }, { status: 403 })
    }

    const organizationId = session.user.organizationId
    const deletedFilter = { organizationId, deletedAt: { not: null } }
    const selectBase = { id: true, deletedAt: true, deletedById: true }
    const deletedBySelect = { deletedBy: { select: { id: true, name: true, email: true } } }

    // Query all soft-deleted items in parallel
    const [
      databases,
      formDefinitions,
      reportDefinitions,
      boards,
      taskInstances,
      reconciliationConfigs,
      agentDefinitions,
      entities,
      groups,
    ] = await Promise.all([
      prismaWithDeleted.database.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.formDefinition.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.reportDefinition.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.board.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.taskInstance.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.reconciliationConfig.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.agentDefinition.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.entity.findMany({
        where: deletedFilter,
        select: { ...selectBase, firstName: true, lastName: true, email: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
      prismaWithDeleted.group.findMany({
        where: deletedFilter,
        select: { ...selectBase, name: true, ...deletedBySelect },
        orderBy: { deletedAt: "desc" },
      }),
    ])

    // Normalize entity names to "name" for consistent UI
    const normalizedEntities = entities.map((e) => ({
      id: e.id,
      name: [e.firstName, e.lastName].filter(Boolean).join(" ") || e.email || "Unknown",
      deletedAt: e.deletedAt,
      deletedById: e.deletedById,
      deletedBy: e.deletedBy,
    }))

    return NextResponse.json({
      database: databases,
      formDefinition: formDefinitions,
      reportDefinition: reportDefinitions,
      board: boards,
      taskInstance: taskInstances,
      reconciliationConfig: reconciliationConfigs,
      agentDefinition: agentDefinitions,
      entity: normalizedEntities,
      group: groups,
    })
  } catch (error: any) {
    console.error("Error fetching trash:", error)
    return NextResponse.json({ error: "Failed to fetch trash" }, { status: 500 })
  }
}
