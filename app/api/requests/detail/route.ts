import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CampaignType, TaskStatus } from "@prisma/client"
import { computeDeterministicRisk, computeLastActivityAt } from "@/lib/services/risk-computation.service"

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const campaignName = searchParams.get("campaignName")
  const campaignType = searchParams.get("campaignType") as CampaignType | null
  const status = searchParams.get("status") as TaskStatus | null
  const search = searchParams.get("search")
  const hasReplies = searchParams.get("hasReplies")
  const isOpened = searchParams.get("isOpened")
  const taskInstanceId = searchParams.get("taskInstanceId") || searchParams.get("jobId")

  const where: any = {
    organizationId: session.user.organizationId
  }

  if (campaignName) {
    where.campaignName = campaignName
  }

  if (campaignType) {
    where.campaignType = campaignType
  }

  if (status) {
    where.status = status
  }

  // Filter by taskInstanceId if provided
  if (taskInstanceId) {
    const instanceExists = await prisma.taskInstance.findFirst({
      where: {
        id: taskInstanceId,
        organizationId: session.user.organizationId
      },
      select: { id: true }
    })
    
    if (!instanceExists) {
      return NextResponse.json([])
    }
    
    where.taskInstanceId = taskInstanceId
  }

  // Build AND conditions array for complex queries
  const andConditions: any[] = []

  // Build search conditions
  if (search) {
    andConditions.push({
      OR: [
        {
          entity: {
            firstName: {
              contains: search,
              mode: "insensitive"
            }
          }
        },
        {
          entity: {
            email: {
              contains: search,
              mode: "insensitive"
            }
          }
        }
      ]
    })
  }

  // Filter by hasReplies (whether task has inbound messages)
  if (hasReplies !== null) {
    const hasRepliesBool = hasReplies === "true"
    if (hasRepliesBool) {
      andConditions.push({
        messages: {
          some: {
            direction: "INBOUND"
          }
        }
      })
    } else {
      andConditions.push({
        OR: [
          {
            messages: {
              none: {}
            }
          },
          {
            messages: {
              every: {
                direction: "OUTBOUND"
              }
            }
          }
        ]
      })
    }
  }

  // Apply AND conditions if we have any
  if (andConditions.length > 0) {
    where.AND = andConditions
  }

  try {
    const tasks = await prisma.request.findMany({
      where,
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
            lastOpenedAt: true,
            subject: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    })

    // Get all request IDs
    const taskIds = tasks.map(t => t.id)
    
    // Get inbound message counts, latest classification, and body for risk computation
    const inboundCountMap = new Map<string, number>()
    const latestClassificationMap = new Map<string, string | null>()
    const latestResponseTextMap = new Map<string, string | null>()
    const latestInboundDateMap = new Map<string, Date | null>()
    const latestFromAddressMap = new Map<string, string>()
    if (taskIds.length > 0) {
      const inboundMessages = await prisma.message.findMany({
        where: {
          requestId: { in: taskIds },
          direction: "INBOUND"
        },
        select: {
          requestId: true,
          aiClassification: true,
          body: true,
          createdAt: true,
          fromAddress: true
        },
        orderBy: {
          createdAt: "desc"
        }
      })
      
      // Count messages and get latest classification/body per request
      for (const message of inboundMessages) {
        inboundCountMap.set(message.requestId, (inboundCountMap.get(message.requestId) || 0) + 1)
        
        if (!latestClassificationMap.has(message.requestId) && message.aiClassification) {
          latestClassificationMap.set(message.requestId, message.aiClassification)
        }
        
        if (!latestResponseTextMap.has(message.requestId) && message.body) {
          latestResponseTextMap.set(message.requestId, message.body)
        }
        
        if (!latestInboundDateMap.has(message.requestId)) {
          latestInboundDateMap.set(message.requestId, message.createdAt)
        }
        
        if (!latestFromAddressMap.has(message.requestId) && message.fromAddress) {
          latestFromAddressMap.set(message.requestId, message.fromAddress)
        }
      }
    }

    // Enrich tasks with reply information, read receipt data, classification, and risk
    let tasksWithReplies = tasks.map((task) => {
      const inboundCount = inboundCountMap.get(task.id) || 0
      const latestOutboundMessage = task.messages && task.messages.length > 0 ? task.messages[0] : null
      const latestClassification = latestClassificationMap.get(task.id) || null
      const latestResponseText = latestResponseTextMap.get(task.id) || null
      const latestInboundDate = latestInboundDateMap.get(task.id) || null
      const latestFromAddress = latestFromAddressMap.get(task.id) || null
      
      // For readStatus computation, openedAt and lastOpenedAt should only be used if they're actual Date values
      // Newly sent emails should have null for these fields until the tracking pixel is hit
      const openedAt = latestOutboundMessage?.openedAt instanceof Date ? latestOutboundMessage.openedAt : null
      const lastOpenedAt = latestOutboundMessage?.lastOpenedAt instanceof Date ? latestOutboundMessage.lastOpenedAt : null
      
      // Compute risk based on current state for validation, but prefer persisted values if they exist
      // This ensures readStatus is always accurate based on openedAt and hasReplies
      const riskComputation = computeDeterministicRisk({
        hasReplies: inboundCount > 0,
        latestResponseText,
        latestInboundClassification: latestClassification,
        completionPercentage: task.completionPercentage,
        openedAt: openedAt,
        lastOpenedAt: lastOpenedAt,
        hasAttachments: task.hasAttachments,
        aiVerified: task.aiVerified,
        lastActivityAt: latestInboundDate || task.lastActivityAt || task.updatedAt,
        deadlineDate: task.deadlineDate || null,
        fromAddress: latestFromAddress
      })
      
      // Use manual override if present, otherwise use persisted risk if available, otherwise compute fresh
      // Always use computed readStatus based on current state (openedAt, hasReplies), not stored value
      // But for riskLevel/riskReason, prefer persisted values (from backfill or real-time computation)
      // unless the underlying data has changed significantly
      let riskLevel: string | null
      let riskReason: string | null
      
      if (task.manualRiskOverride) {
        riskLevel = task.manualRiskOverride
        riskReason = task.overrideReason || "Manually set"
      } else if (task.riskLevel && task.riskReason) {
        // Use persisted risk values (from backfill or previous computation)
        // This preserves LLM-based reasoning and avoids recomputing on every request
        riskLevel = task.riskLevel
        riskReason = task.riskReason
      } else {
        // No persisted risk yet, use computed (deterministic fallback)
        riskLevel = riskComputation.riskLevel
        riskReason = riskComputation.riskReason
      }
      
      const readStatus = riskComputation.readStatus // Always use computed readStatus, not stored value
      const lastActivityAt = computeLastActivityAt({
        readStatus: riskComputation.readStatus,
        hasReplies: inboundCount > 0,
        latestResponseText,
        latestInboundClassification: latestClassification,
        completionPercentage: task.completionPercentage,
        openedAt: openedAt, // Use the validated openedAt (null if not a Date)
        lastOpenedAt: lastOpenedAt, // Use the validated lastOpenedAt (null if not a Date)
        hasAttachments: task.hasAttachments,
        aiVerified: task.aiVerified,
        lastActivityAt: latestInboundDate || task.lastActivityAt || task.updatedAt
      }) || latestInboundDate || task.updatedAt
      
      // Return task with computed risk data
      
      return {
        ...task,
        hasReplies: inboundCount > 0,
        replyCount: inboundCount,
        messageCount: task._count.messages,
        isOpened: latestOutboundMessage?.openedAt ? true : false,
        openedAt: latestOutboundMessage?.openedAt || null,
        openedCount: latestOutboundMessage?.openedCount || 0,
        lastOpenedAt: latestOutboundMessage?.lastOpenedAt || null,
        latestInboundClassification: latestClassification,
        latestOutboundSubject: latestOutboundMessage?.subject || null,
        latestResponseText: latestResponseText ? (latestResponseText.length > 200 ? latestResponseText.substring(0, 200) + "..." : latestResponseText) : null,
        // Risk data
        readStatus,
        riskLevel,
        riskReason,
        lastActivityAt: lastActivityAt instanceof Date ? lastActivityAt.toISOString() : lastActivityAt,
        isManualRiskOverride: !!task.manualRiskOverride,
        // Deadline and reminder fields (already in task via spread, but explicitly listed for clarity)
        deadlineDate: task.deadlineDate || null,
        remindersEnabled: task.remindersEnabled || false
      }
    })

    // Filter by isOpened if requested
    if (isOpened !== null) {
      const isOpenedBool = isOpened === "true"
      tasksWithReplies = tasksWithReplies.filter(task => {
        return isOpenedBool ? task.isOpened === true : task.isOpened === false
      })
    }

    return NextResponse.json(tasksWithReplies)
  } catch (error: any) {
    console.error('[API /requests/detail] Error:', error.message)
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    )
  }
}
