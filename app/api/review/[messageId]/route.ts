import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/review/[messageId]
 * Fetch complete review context for a message (both sent requests and replies)
 * Guards: Only from user's organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const { messageId } = params

    // Fetch the message with full context (both INBOUND and OUTBOUND)
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        task: {
          organizationId // Access control
        }
      },
      include: {
        task: {
          include: {
            entity: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            job: {
              include: {
                board: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        },
        collectedItems: {
          orderBy: { receivedAt: "desc" }
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!message) {
      return NextResponse.json(
        { error: "Message not found", code: "INVALID_REVIEW" },
        { status: 404 }
      )
    }

    // Fetch all messages in the thread for context
    const thread = await prisma.message.findMany({
      where: {
        taskId: message.taskId
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        direction: true,
        subject: true,
        body: true,
        htmlBody: true,
        fromAddress: true,
        toAddress: true,
        createdAt: true,
        attachments: true,
        aiClassification: true,
        aiReasoning: true,
        isAutoReply: true,
        openedAt: true,
        openedCount: true
      }
    })

    // Format response
    return NextResponse.json({
      message: {
        id: message.id,
        direction: message.direction,
        subject: message.subject,
        body: message.body,
        htmlBody: message.htmlBody,
        fromAddress: message.fromAddress,
        toAddress: message.toAddress,
        createdAt: message.createdAt.toISOString(),
        aiClassification: message.aiClassification,
        aiReasoning: message.aiReasoning,
        isAutoReply: message.isAutoReply,
        reviewNotes: message.reviewNotes
      },
      task: {
        id: message.task.id,
        status: message.task.status,
        campaignName: message.task.campaignName,
        aiSummary: message.task.aiSummary,
        aiSummaryConfidence: message.task.aiSummaryConfidence,
        riskLevel: message.task.riskLevel,
        riskReason: message.task.riskReason,
        entity: message.task.entity
      },
      job: message.task.job ? {
        id: message.task.job.id,
        name: message.task.job.name,
        board: message.task.job.board
      } : null,
      thread,
      attachments: message.collectedItems.map(item => ({
        id: item.id,
        filename: item.filename,
        fileKey: item.fileKey,
        fileUrl: item.fileUrl,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        source: item.source,
        status: item.status,
        receivedAt: item.receivedAt.toISOString()
      })),
      reviewStatus: message.reviewStatus,
      reviewedAt: message.reviewedAt?.toISOString() || null,
      reviewedBy: message.reviewedBy
    })
  } catch (error: any) {
    console.error("[API/review/[messageId]] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch review data", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/review/[messageId]
 * Update review status for a message
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const { messageId } = params

    const body = await request.json()
    const { status, notes } = body

    // Validate status
    const validStatuses = ["UNREVIEWED", "NEEDS_FOLLOW_UP", "REVIEWED"]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    // Verify message exists and belongs to user's org
    const existingMessage = await prisma.message.findFirst({
      where: {
        id: messageId,
        direction: "INBOUND",
        task: { organizationId }
      }
    })

    if (!existingMessage) {
      return NextResponse.json(
        { error: "Message not found or not a reply" },
        { status: 404 }
      )
    }

    // Update message
    const updateData: any = {}
    if (status) {
      updateData.reviewStatus = status
      updateData.reviewedAt = new Date()
      updateData.reviewedById = userId
    }
    if (notes !== undefined) {
      updateData.reviewNotes = notes
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData
    })

    // Create audit log
    if (status) {
      await prisma.reviewAuditLog.create({
        data: {
          messageId,
          userId,
          action: status === "REVIEWED" 
            ? "marked_reviewed" 
            : status === "NEEDS_FOLLOW_UP" 
            ? "marked_needs_follow_up" 
            : "marked_unreviewed",
          metadata: { previousStatus: existingMessage.reviewStatus }
        }
      })

      // FEEDBACK LOOP: Link human decision to latest AIRecommendation
      // Find the most recent recommendation for this message that hasn't been acted on
      const latestRecommendation = await prisma.aIRecommendation.findFirst({
        where: { 
          messageId,
          humanActedAt: null // Only update if not already acted on
        },
        orderBy: { createdAt: "desc" }
      })

      if (latestRecommendation) {
        await prisma.aIRecommendation.update({
          where: { id: latestRecommendation.id },
          data: {
            humanAction: status,
            agreedWithAI: status === latestRecommendation.recommendedAction,
            humanActedAt: new Date()
          }
        })
      }
    }

    return NextResponse.json({
      success: true,
      reviewStatus: updatedMessage.reviewStatus,
      reviewedAt: updatedMessage.reviewedAt?.toISOString()
    })
  } catch (error: any) {
    console.error("[API/review/[messageId] PATCH] Error:", error)
    return NextResponse.json(
      { error: "Failed to update review status", message: error.message },
      { status: 500 }
    )
  }
}
