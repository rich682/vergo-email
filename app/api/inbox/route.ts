/**
 * GET /api/inbox
 *
 * Returns recent inbound messages with their AI analysis for the global AI inbox.
 * Filters auto-replies, supports pagination and filtering.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getJobAccessFilter } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role as string | undefined

    const { searchParams } = new URL(request.url)
    const readStatusFilter = searchParams.get("readStatus") // unread | read | all
    const riskFilter = searchParams.get("riskLevel") // high | medium | low
    const boardId = searchParams.get("boardId") // optional board filter
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)
    const skip = (page - 1) * limit

    // Get job access filter based on role and action permissions
    const jobAccessFilter = getJobAccessFilter(userId, userRole, "inbox:view_all", session.user.orgActionPermissions)

    // Build task instance filter (combines access filter + optional board filter)
    const taskInstanceFilter: any = {
      ...(jobAccessFilter || {}),
      ...(boardId ? { boardId } : {}),
    }

    // Build where clause for messages
    const where: any = {
      direction: "INBOUND",
      isAutoReply: false,
      request: {
        organizationId,
        isDraft: false,
        taskInstanceId: { not: null },
        ...(Object.keys(taskInstanceFilter).length > 0 ? { taskInstance: taskInstanceFilter } : {}),
      },
    }

    // Filter by read status on the parent request
    if (readStatusFilter === "unread") {
      where.request.readStatus = { in: [null, "unread"] }
    } else if (readStatusFilter === "read") {
      where.request.readStatus = "read"
    }

    // Filter by risk level on the parent request
    if (riskFilter) {
      where.request.riskLevel = riskFilter
    }

    // Count + Fetch in parallel for faster response
    console.log("[API] GET /api/inbox", { boardId, readStatusFilter, riskFilter, page, limit })
    const [totalCount, messages] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
      where,
      select: {
        id: true,
        body: true,
        subject: true,
        fromAddress: true,
        createdAt: true,
        aiClassification: true,
        aiReasoning: true,
        attachments: true,
        request: {
          select: {
            id: true,
            campaignName: true,
            requestType: true,
            status: true,
            completionPercentage: true,
            aiReasoning: true,
            aiSummary: true,
            aiSummaryConfidence: true,
            riskLevel: true,
            riskReason: true,
            readStatus: true,
            hasAttachments: true,
            entity: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                companyName: true,
              },
            },
            taskInstance: {
              select: {
                id: true,
                name: true,
                board: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    })
    ])

    // Build enriched response
    const inboxItems = messages.map((msg) => {
      const req = msg.request

      // Count attachments from message JSON
      let attachmentCount = 0
      if (msg.attachments && Array.isArray(msg.attachments)) {
        attachmentCount = msg.attachments.length
      }

      // Extract body snippet
      const bodyText = msg.body || ""
      const snippet = bodyText.replace(/<[^>]+>/g, "").trim().slice(0, 200)

      // Get completion analysis from AI reasoning
      let completionAnalysis = ""
      if (req.aiReasoning && typeof req.aiReasoning === "object") {
        const reasoning = req.aiReasoning as Record<string, any>
        completionAnalysis = reasoning.completionAnalysis || ""
      }

      return {
        messageId: msg.id,
        subject: msg.subject,
        fromAddress: msg.fromAddress,
        receivedAt: msg.createdAt,
        snippet,
        classification: msg.aiClassification,
        classificationReasoning: msg.aiReasoning,
        attachmentCount,
        // Request-level AI data
        requestId: req.id,
        campaignName: req.campaignName,
        requestType: req.requestType,
        requestStatus: req.status,
        completionPercentage: req.completionPercentage || 0,
        aiSummary: req.aiSummary,
        aiSummaryConfidence: req.aiSummaryConfidence,
        riskLevel: req.riskLevel,
        riskReason: req.riskReason,
        readStatus: req.readStatus,
        completionAnalysis,
        // Related entities
        sender: req.entity
          ? {
              id: req.entity.id,
              name: [req.entity.firstName, req.entity.lastName]
                .filter(Boolean)
                .join(" "),
              email: req.entity.email,
              company: req.entity.companyName,
            }
          : {
              name: msg.fromAddress.split("@")[0],
              email: msg.fromAddress,
            },
        task: req.taskInstance
          ? {
              id: req.taskInstance.id,
              name: req.taskInstance.name,
              boardName: req.taskInstance.board?.name,
            }
          : null,
      }
    })

    console.log("[API] GET /api/inbox result", { itemCount: inboxItems.length, total: totalCount, page })
    return NextResponse.json({
      success: true,
      items: inboxItems,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    })
  } catch (error: any) {
    console.error("[Inbox API] Error:", error?.message)
    return NextResponse.json(
      { error: "Failed to fetch inbox" },
      { status: 500 }
    )
  }
}
