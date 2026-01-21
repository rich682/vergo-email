import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function POST(
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

  try {
    // Find the request
    const task = await prisma.request.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      },
      include: {
        messages: {
          where: {
            direction: "OUTBOUND"
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    const latestOutboundMessage = task.messages[0]
    if (!latestOutboundMessage) {
      return NextResponse.json(
        { error: "No outbound message found" },
        { status: 404 }
      )
    }

    const now = new Date()
    const isFirstOpen = !latestOutboundMessage.openedAt

    // Update read receipt
    await prisma.message.update({
      where: { id: latestOutboundMessage.id },
      data: {
        openedAt: latestOutboundMessage.openedAt || now,
        openedCount: { increment: 1 },
        lastOpenedAt: now
      }
    })

    return NextResponse.json({ 
      success: true,
      message: "Email marked as read",
      openedAt: now,
      isFirstOpen
    })
  } catch (error: any) {
    console.error("Error marking email as read:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}











