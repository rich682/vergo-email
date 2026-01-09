import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CampaignType, TaskStatus } from "@prisma/client"

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
    const tasks = await prisma.task.findMany({
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

    // Get all task IDs to efficiently count inbound messages and get latest classification
    const taskIds = tasks.map(t => t.id)
    
    // Get inbound message counts and latest classification for all tasks
    const inboundCountMap = new Map<string, number>()
    const latestClassificationMap = new Map<string, string | null>()
    if (taskIds.length > 0) {
      // Get all inbound messages with classification
      const inboundMessages = await prisma.message.findMany({
        where: {
          taskId: { in: taskIds },
          direction: "INBOUND"
        },
        select: {
          taskId: true,
          aiClassification: true,
          createdAt: true
        },
        orderBy: {
          createdAt: "desc"
        }
      })
      
      // Count messages and get latest classification per task
      for (const message of inboundMessages) {
        inboundCountMap.set(message.taskId, (inboundCountMap.get(message.taskId) || 0) + 1)
        
        // Store latest classification (first one we see due to DESC order)
        if (!latestClassificationMap.has(message.taskId) && message.aiClassification) {
          latestClassificationMap.set(message.taskId, message.aiClassification)
        }
      }
    }

    // Enrich tasks with reply information, read receipt data, and classification
    let tasksWithReplies = tasks.map((task) => {
      const inboundCount = inboundCountMap.get(task.id) || 0
      const latestOutboundMessage = task.messages[0] || null
      const latestClassification = latestClassificationMap.get(task.id) || null
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
        latestOutboundSubject: latestOutboundMessage?.subject || null
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
    console.error('[API /tasks] Error:', error.message)
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    )
  }
}
