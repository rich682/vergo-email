import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/admin/debug/[taskId]
 * 
 * Admin-only endpoint for debugging task state.
 * Returns metadata only - no sensitive email body content.
 * 
 * Requires:
 * - Authenticated session
 * - Admin role
 * - Task must belong to user's organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // Check admin role
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })

  if (user?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    )
  }

  try {
    // Fetch task with org scoping
    const task = await prisma.task.findFirst({
      where: {
        id: params.taskId,
        organizationId: session.user.organizationId
      },
      select: {
        id: true,
        campaignName: true,
        campaignType: true,
        status: true,
        threadId: true,
        hasAttachments: true,
        aiVerified: true,
        completionPercentage: true,
        riskLevel: true,
        riskReason: true,
        readStatus: true,
        manualRiskOverride: true,
        deadlineDate: true,
        remindersEnabled: true,
        remindersApproved: true,
        remindersStartDelayHours: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true,
        createdAt: true,
        updatedAt: true,
        lastActivityAt: true,
        entity: {
          select: {
            id: true,
            firstName: true,
            // Don't include email for privacy - hash it instead
            contactType: true
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

    // Get message counts (no content)
    const messageCounts = await prisma.message.groupBy({
      by: ["direction"],
      where: { taskId: params.taskId },
      _count: { id: true }
    })

    const outboundCount = messageCounts.find(m => m.direction === "OUTBOUND")?._count.id || 0
    const inboundCount = messageCounts.find(m => m.direction === "INBOUND")?._count.id || 0

    // Get classification breakdown
    const classificationCounts = await prisma.message.groupBy({
      by: ["aiClassification"],
      where: { 
        taskId: params.taskId,
        direction: "INBOUND"
      },
      _count: { id: true }
    })

    const classifications: Record<string, number> = {}
    for (const c of classificationCounts) {
      classifications[c.aiClassification || "unclassified"] = c._count.id
    }

    // Get reminder state
    const reminderState = await prisma.reminderState.findFirst({
      where: { taskId: params.taskId },
      select: {
        reminderNumber: true,
        sentCount: true,
        nextSendAt: true,
        lastSentAt: true,
        stoppedReason: true
      }
    })

    // Get last outbound message metadata (no body)
    const lastOutbound = await prisma.message.findFirst({
      where: {
        taskId: params.taskId,
        direction: "OUTBOUND"
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subject: true,
        createdAt: true,
        openedAt: true,
        openedCount: true,
        lastOpenedAt: true,
        messageIdHeader: true
      }
    })

    // Get last inbound message metadata (no body)
    const lastInbound = await prisma.message.findFirst({
      where: {
        taskId: params.taskId,
        direction: "INBOUND"
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subject: true,
        createdAt: true,
        aiClassification: true,
        aiReasoning: true
      }
    })

    return NextResponse.json({
      task: {
        id: task.id,
        campaignName: task.campaignName,
        campaignType: task.campaignType,
        status: task.status,
        threadId: task.threadId,
        hasAttachments: task.hasAttachments,
        aiVerified: task.aiVerified,
        completionPercentage: task.completionPercentage,
        risk: {
          level: task.riskLevel,
          reason: task.riskReason,
          readStatus: task.readStatus,
          isManualOverride: task.manualRiskOverride
        },
        deadlineDate: task.deadlineDate,
        timestamps: {
          created: task.createdAt,
          updated: task.updatedAt,
          lastActivity: task.lastActivityAt
        },
        entity: task.entity ? {
          id: task.entity.id,
          firstName: task.entity.firstName,
          contactType: task.entity.contactType
        } : null
      },
      messages: {
        outboundCount,
        inboundCount,
        totalCount: outboundCount + inboundCount,
        classifications
      },
      reminders: {
        enabled: task.remindersEnabled,
        approved: task.remindersApproved,
        config: {
          startDelayHours: task.remindersStartDelayHours,
          frequencyHours: task.remindersFrequencyHours,
          maxCount: task.remindersMaxCount
        },
        state: reminderState
      },
      lastOutbound: lastOutbound ? {
        id: lastOutbound.id,
        subject: lastOutbound.subject,
        sentAt: lastOutbound.createdAt,
        openedAt: lastOutbound.openedAt,
        openedCount: lastOutbound.openedCount,
        lastOpenedAt: lastOutbound.lastOpenedAt,
        messageIdHeader: lastOutbound.messageIdHeader
      } : null,
      lastInbound: lastInbound ? {
        id: lastInbound.id,
        subject: lastInbound.subject,
        receivedAt: lastInbound.createdAt,
        classification: lastInbound.aiClassification,
        reasoning: lastInbound.aiReasoning
      } : null,
      _debug: {
        generatedAt: new Date().toISOString(),
        orgId: session.user.organizationId
      }
    })
  } catch (error: any) {
    console.error("Error in admin debug endpoint:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
