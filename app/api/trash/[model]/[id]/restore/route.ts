/**
 * Trash Restore API — Restore a soft-deleted item (admin only)
 *
 * POST /api/trash/[model]/[id]/restore — Restores item and cascade children
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/permissions"
import { prismaWithDeleted } from "@/lib/prisma"
import { TrashModelKey, TRASH_MODELS } from "@/lib/trash"

type RouteParams = { params: { model: string; id: string } }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can restore items" }, { status: 403 })
    }

    const { model, id } = params
    const organizationId = session.user.organizationId

    if (!TRASH_MODELS[model as TrashModelKey]) {
      return NextResponse.json({ error: "Invalid model type" }, { status: 400 })
    }

    const restoreData = { deletedAt: null, deletedById: null }

    switch (model as TrashModelKey) {
      case "database": {
        const item = await prismaWithDeleted.database.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.database.update({ where: { id }, data: restoreData })

        // Cascade restore: restore report definitions that were deleted at the same time
        if (item.deletedAt) {
          await prismaWithDeleted.reportDefinition.updateMany({
            where: { databaseId: id, organizationId, deletedAt: item.deletedAt },
            data: restoreData,
          })
        }
        break
      }

      case "board": {
        const item = await prismaWithDeleted.board.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.board.update({ where: { id }, data: restoreData })

        // Cascade restore: restore task instances that were deleted at the same time
        if (item.deletedAt) {
          await prismaWithDeleted.taskInstance.updateMany({
            where: { boardId: id, organizationId, deletedAt: item.deletedAt },
            data: restoreData,
          })
        }
        break
      }

      case "formDefinition": {
        const item = await prismaWithDeleted.formDefinition.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.formDefinition.update({ where: { id }, data: restoreData })
        break
      }

      case "reportDefinition": {
        const item = await prismaWithDeleted.reportDefinition.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.reportDefinition.update({ where: { id }, data: restoreData })
        break
      }

      case "taskInstance": {
        const item = await prismaWithDeleted.taskInstance.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.taskInstance.update({ where: { id }, data: restoreData })
        break
      }

      case "reconciliationConfig": {
        const item = await prismaWithDeleted.reconciliationConfig.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.reconciliationConfig.update({ where: { id }, data: restoreData })
        break
      }

      case "agentDefinition": {
        const item = await prismaWithDeleted.agentDefinition.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.agentDefinition.update({ where: { id }, data: restoreData })
        break
      }

      case "entity": {
        const item = await prismaWithDeleted.entity.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.entity.update({ where: { id }, data: restoreData })
        break
      }

      case "group": {
        const item = await prismaWithDeleted.group.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.group.update({ where: { id }, data: restoreData })
        break
      }

      default:
        return NextResponse.json({ error: "Invalid model type" }, { status: 400 })
    }

    return NextResponse.json({ success: true, restored: true })
  } catch (error: any) {
    console.error("Error restoring item:", error)
    return NextResponse.json({ error: "Failed to restore item" }, { status: 500 })
  }
}
