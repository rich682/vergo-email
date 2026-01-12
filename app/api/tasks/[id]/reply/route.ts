import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EmailSendingService } from "@/lib/services/email-sending.service"

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
    const body = await request.json()
    const { body: replyBody } = body

    const task = await prisma.task.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      },
      include: {
        entity: true
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    if (!task.entity.email) {
      return NextResponse.json(
        { error: "Entity email not found" },
        { status: 400 }
      )
    }

    // Send reply email
    const sent = await EmailSendingService.sendEmail({
      organizationId: session.user.organizationId,
      to: task.entity.email,
      toName: task.entity.firstName,
      subject: `Re: ${task.replyToEmail || "Your message"}`,
      body: replyBody,
      campaignName: task.campaignName || undefined,
      campaignType: task.campaignType || undefined
    })

    // Persist outbound message for thread history
    await prisma.message.create({
      data: {
        taskId: task.id,
        entityId: task.entityId,
        direction: "OUTBOUND",
        channel: "EMAIL",
        subject: `Re: ${task.replyToEmail || task.campaignName || "Your message"}`,
        body: replyBody,
        fromAddress: session.user.email || "noreply@vergo.com",
        toAddress: task.entity.email,
        providerId: sent?.providerId || null,
        providerData: sent?.providerData || null,
        threadId: task.threadId || null,
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error sending reply:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

