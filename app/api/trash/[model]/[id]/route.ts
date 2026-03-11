/**
 * Trash Permanent Delete API — Hard-delete a soft-deleted item (admin only)
 *
 * DELETE /api/trash/[model]/[id] — Permanently removes item and cascade children
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/permissions"
import { prismaWithDeleted } from "@/lib/prisma"
import { TrashModelKey, TRASH_MODELS } from "@/lib/trash"

type RouteParams = { params: { model: string; id: string } }

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can permanently delete items" }, { status: 403 })
    }

    const { model, id } = params
    const organizationId = session.user.organizationId

    if (!TRASH_MODELS[model as TrashModelKey]) {
      return NextResponse.json({ error: "Invalid model type" }, { status: 400 })
    }

    switch (model as TrashModelKey) {
      case "database": {
        const item = await prismaWithDeleted.database.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.database.delete({ where: { id } })
        break
      }

      case "board": {
        const item = await prismaWithDeleted.board.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        // Delete cascade children first
        await prismaWithDeleted.taskInstance.deleteMany({
          where: { boardId: id, organizationId, deletedAt: { not: null } },
        })
        await prismaWithDeleted.board.delete({ where: { id } })
        break
      }

      case "formDefinition": {
        const item = await prismaWithDeleted.formDefinition.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.formDefinition.delete({ where: { id } })
        break
      }

      case "reportDefinition": {
        const item = await prismaWithDeleted.reportDefinition.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.reportDefinition.delete({ where: { id } })
        break
      }

      case "taskInstance": {
        const item = await prismaWithDeleted.taskInstance.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.taskInstance.delete({ where: { id } })
        break
      }

      case "reconciliationConfig": {
        const item = await prismaWithDeleted.reconciliationConfig.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.reconciliationConfig.delete({ where: { id } })
        break
      }

      case "agentDefinition": {
        const item = await prismaWithDeleted.agentDefinition.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.agentDefinition.delete({ where: { id } })
        break
      }

      case "entity": {
        const item = await prismaWithDeleted.entity.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.entity.delete({ where: { id } })
        break
      }

      case "group": {
        const item = await prismaWithDeleted.group.findFirst({
          where: { id, organizationId, deletedAt: { not: null } },
        })
        if (!item) return NextResponse.json({ error: "Item not found in trash" }, { status: 404 })

        await prismaWithDeleted.group.delete({ where: { id } })
        break
      }

      default:
        return NextResponse.json({ error: "Invalid model type" }, { status: 400 })
    }

    return NextResponse.json({ success: true, permanentlyDeleted: true })
  } catch (error: any) {
    console.error("Error permanently deleting item:", error)
    return NextResponse.json({ error: "Failed to permanently delete item" }, { status: 500 })
  }
}
