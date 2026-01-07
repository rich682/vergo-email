import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const task = await prisma.task.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId
    },
    include: {
      entity: true,
      messages: {
        where: {
          direction: "OUTBOUND"
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        select: {
          openedAt: true,
          openedCount: true,
          lastOpenedAt: true
        }
      }
    }
  })

  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  const latestOutboundMessage = task.messages[0] || null
  const taskWithReadReceipt = {
    ...task,
    isOpened: latestOutboundMessage?.openedAt ? true : false,
    openedAt: latestOutboundMessage?.openedAt || null,
    openedCount: latestOutboundMessage?.openedCount || 0,
    lastOpenedAt: latestOutboundMessage?.lastOpenedAt || null
  }

  return NextResponse.json(taskWithReadReceipt)
}

