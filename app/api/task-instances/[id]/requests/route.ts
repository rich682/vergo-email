/**
 * Job Requests API Endpoint
 *
 * GET /api/task-instances/[id]/requests - Get EmailDrafts (Requests) associated with a Job
 *
 * POST /api/task-instances/[id]/requests - Draft operations
 *   Body: { action: "create_draft", ...actionParams }
 *   - action: "create_draft" - Create a new draft request (for scheduled sending)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { BusinessDayService, ScheduleConfig } from "@/lib/services/business-day.service"
import { UserRole } from "@prisma/client"

export const dynamic = 'force-dynamic'

/**
 * GET - Get requests for a task instance
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    // Verify task instance exists and user has access
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Fetch EmailDrafts for this task instance
    const emailDrafts = await prisma.emailDraft.findMany({
      where: {
        taskInstanceId,
        organizationId
      },
      select: {
        id: true,
        prompt: true,
        generatedSubject: true,
        generatedBody: true,
        generatedHtmlBody: true,
        subjectTemplate: true,
        bodyTemplate: true,
        htmlBodyTemplate: true,
        status: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
        deadlineDate: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    // Get requests directly by taskInstanceId (exclude drafts for this endpoint)
    const requests = await prisma.request.findMany({
      where: {
        organizationId,
        taskInstanceId,
        isDraft: false
      },
      select: {
        id: true,
        status: true,
        readStatus: true,
        remindersEnabled: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true,
        createdAt: true,
        // AI fields
        completionPercentage: true,
        aiReasoning: true,
        aiSummary: true,
        riskLevel: true,
        riskReason: true,
        hasAttachments: true,
        aiVerified: true,
        entity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        messages: {
          where: { direction: "OUTBOUND" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            id: true,
            subject: true,
            body: true,
            createdAt: true
          }
        }
      }
    })

    // Fetch latest inbound message per request (for AI reply preview)
    const requestIds = requests.map(r => r.id)
    const latestInboundMessages = requestIds.length > 0 ? await prisma.message.findMany({
      where: {
        requestId: { in: requestIds },
        direction: "INBOUND",
        isAutoReply: false,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        requestId: true,
        body: true,
        aiClassification: true,
        aiReasoning: true,
        createdAt: true,
      },
    }) : []

    // Build a map of requestId -> latest inbound message (first per request since ordered desc)
    const latestInboundByRequest = new Map<string, typeof latestInboundMessages[0]>()
    for (const msg of latestInboundMessages) {
      if (!latestInboundByRequest.has(msg.requestId)) {
        latestInboundByRequest.set(msg.requestId, msg)
      }
    }

    // Track which requests have been matched to drafts
    const matchedRequestIds = new Set<string>()
    
    // Match requests to emailDrafts by creation time proximity (expanded to 30 minutes)
    const enrichedRequests = emailDrafts.map(draft => {
      let matchedRequests: typeof requests = []

      if (draft.sentAt) {
        const sentTime = new Date(draft.sentAt).getTime()
        matchedRequests = requests.filter(req => {
          const reqTime = new Date(req.createdAt).getTime()
          // Expanded window to 30 minutes to handle batch sends
          return Math.abs(reqTime - sentTime) < 30 * 60 * 1000
        })
        // Track matched requests
        matchedRequests.forEach(req => matchedRequestIds.add(req.id))
      }

      const firstReq = matchedRequests[0]
      const reminderConfig = firstReq ? {
        enabled: firstReq.remindersEnabled,
        frequencyHours: firstReq.remindersFrequencyHours,
        maxCount: firstReq.remindersMaxCount
      } : null

      return {
        ...draft,
        taskCount: matchedRequests.length,
        reminderConfig,
        recipients: matchedRequests.map(req => {
          const latestInbound = latestInboundByRequest.get(req.id)
          const bodyText = latestInbound?.body || ""
          const snippet = bodyText.replace(/<[^>]+>/g, "").trim().slice(0, 150)
          
          // Extract completionAnalysis from aiReasoning JSON
          let completionAnalysis = ""
          if (req.aiReasoning && typeof req.aiReasoning === "object") {
            const reasoning = req.aiReasoning as Record<string, any>
            completionAnalysis = reasoning.completionAnalysis || ""
          }
          
          return {
            id: req.id,
            entityId: req.entity?.id || null,
            name: req.entity?.firstName 
              ? `${req.entity.firstName}${req.entity.lastName ? ` ${req.entity.lastName}` : ''}`
              : 'Unknown',
            email: req.entity?.email || 'Unknown',
            status: req.status || 'NO_REPLY',
            readStatus: req.readStatus || 'unread',
            hasReplied: req.readStatus === 'replied',
            // AI fields
            completionPercentage: req.completionPercentage || 0,
            aiSummary: req.aiSummary || null,
            riskLevel: req.riskLevel || null,
            riskReason: req.riskReason || null,
            completionAnalysis,
            latestReply: latestInbound ? {
              snippet,
              classification: latestInbound.aiClassification || null,
              receivedAt: latestInbound.createdAt,
            } : null,
            sentMessage: req.messages[0] ? {
              subject: req.messages[0].subject || '',
              body: req.messages[0].body || '',
              sentAt: req.messages[0].createdAt
            } : null
          }
        })
      }
    })
    
    // Find requests that weren't matched to any EmailDraft (standalone requests)
    const unmatchedRequests = requests.filter(req => !matchedRequestIds.has(req.id))
    
    // Group unmatched requests by campaignName to create synthetic "request groups"
    const unmatchedGroups = new Map<string, typeof requests>()
    for (const req of unmatchedRequests) {
      const key = req.messages[0]?.subject || 'Request'
      if (!unmatchedGroups.has(key)) {
        unmatchedGroups.set(key, [])
      }
      unmatchedGroups.get(key)!.push(req)
    }
    
    // Convert unmatched groups to enriched request format
    const unmatchedEnriched = Array.from(unmatchedGroups.entries()).map(([subject, reqs]) => {
      const firstReq = reqs[0]
      const reminderConfig = firstReq ? {
        enabled: firstReq.remindersEnabled,
        frequencyHours: firstReq.remindersFrequencyHours,
        maxCount: firstReq.remindersMaxCount
      } : null
      
      return {
        id: `unmatched-${firstReq.id}`,
        prompt: '',
        generatedSubject: subject,
        generatedBody: firstReq.messages[0]?.body || '',
        generatedHtmlBody: null,
        subjectTemplate: null,
        bodyTemplate: null,
        htmlBodyTemplate: null,
        status: 'SENT',
        sentAt: firstReq.createdAt,
        createdAt: firstReq.createdAt,
        updatedAt: firstReq.createdAt,
        deadlineDate: null,
        user: { id: '', name: 'System', email: '' },
        taskCount: reqs.length,
        reminderConfig,
        recipients: reqs.map(req => {
          const latestInbound = latestInboundByRequest.get(req.id)
          const bodyText = latestInbound?.body || ""
          const snippet = bodyText.replace(/<[^>]+>/g, "").trim().slice(0, 150)
          
          let completionAnalysis = ""
          if (req.aiReasoning && typeof req.aiReasoning === "object") {
            const reasoning = req.aiReasoning as Record<string, any>
            completionAnalysis = reasoning.completionAnalysis || ""
          }
          
          return {
            id: req.id,
            entityId: req.entity?.id || null,
            name: req.entity?.firstName 
              ? `${req.entity.firstName}${req.entity.lastName ? ` ${req.entity.lastName}` : ''}`
              : 'Unknown',
            email: req.entity?.email || 'Unknown',
            status: req.status || 'NO_REPLY',
            readStatus: req.readStatus || 'unread',
            hasReplied: req.readStatus === 'replied',
            // AI fields
            completionPercentage: req.completionPercentage || 0,
            aiSummary: req.aiSummary || null,
            riskLevel: req.riskLevel || null,
            riskReason: req.riskReason || null,
            completionAnalysis,
            latestReply: latestInbound ? {
              snippet,
              classification: latestInbound.aiClassification || null,
              receivedAt: latestInbound.createdAt,
            } : null,
            sentMessage: req.messages[0] ? {
              subject: req.messages[0].subject || '',
              body: req.messages[0].body || '',
              sentAt: req.messages[0].createdAt
            } : null
          }
        })
      }
    })
    
    // Combine matched EmailDraft requests with unmatched direct requests
    const allRequests = [...enrichedRequests, ...unmatchedEnriched]

    // Build response
    const response: any = {
      success: true,
      requests: allRequests
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error("Get task instance requests error:", error)
    return NextResponse.json(
      { error: "Failed to get requests" },
      { status: 500 }
    )
  }
}

/**
 * POST - Create a scheduled draft request
 * Body: { action: "create_draft", ...actionParams }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const { id: taskInstanceId } = await params

    // Verify task instance exists and user has edit access
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'edit')
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (action !== "create_draft") {
      return NextResponse.json({ error: "action must be 'create_draft'" }, { status: 400 })
    }

    return handleCreateDraft(taskInstanceId, organizationId, userId, body)

  } catch (error: any) {
    console.error("Draft operation error:", error)
    return NextResponse.json(
      { error: "Failed to process draft operation" },
      { status: 500 }
    )
  }
}

// ==================== Helper Functions ====================

/**
 * Create a new draft request for scheduled sending
 */
async function handleCreateDraft(
  taskInstanceId: string,
  organizationId: string,
  userId: string,
  body: any
): Promise<NextResponse> {
  try {
    console.log("[handleCreateDraft] Starting draft creation", { taskInstanceId, organizationId, userId })
    
    const { 
      entityId, 
      subject, 
      body: bodyContent, 
      htmlBody,
      scheduleConfig,
      remindersEnabled = false,
      remindersFrequencyHours,
      remindersMaxCount
    } = body

    console.log("[handleCreateDraft] Request body parsed", { entityId, subject: !!subject, bodyContent: !!bodyContent, scheduleConfig })

  // Validate required fields
  if (!entityId) {
    console.log("[handleCreateDraft] Missing entityId")
    return NextResponse.json({ error: "entityId is required" }, { status: 400 })
  }
  if (!subject || !bodyContent) {
    console.log("[handleCreateDraft] Missing subject or body")
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 })
  }

  // Verify entity exists and belongs to organization
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, organizationId }
  })
  if (!entity) {
    console.log("[handleCreateDraft] Entity not found", { entityId })
    return NextResponse.json({ error: "Entity not found" }, { status: 404 })
  }
  console.log("[handleCreateDraft] Entity found", { entityId, email: entity.email })

  // Get task instance with board for period-aware scheduling
  const taskInstance = await prisma.taskInstance.findFirst({
    where: { id: taskInstanceId, organizationId },
    include: {
      board: {
        select: { id: true, periodStart: true, periodEnd: true }
      }
    }
  })

  if (!taskInstance) {
    console.log("[handleCreateDraft] Task instance not found", { taskInstanceId })
    return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
  }
  console.log("[handleCreateDraft] Task instance found", { 
    taskInstanceId, 
    boardId: taskInstance.board?.id,
    periodStart: taskInstance.board?.periodStart,
    periodEnd: taskInstance.board?.periodEnd
  })

  // Compute scheduledSendAt if period-aware scheduling
  let scheduledSendAt: Date | null = null
  const config = scheduleConfig as ScheduleConfig | null
  if (config?.mode === "period_aware" && taskInstance.board) {
    console.log("[handleCreateDraft] Computing scheduled date", { config })
    scheduledSendAt = BusinessDayService.computeFromConfig(
      config,
      taskInstance.board.periodStart,
      taskInstance.board.periodEnd
    )
    console.log("[handleCreateDraft] Scheduled date computed", { scheduledSendAt })
  }

  // Generate a unique threadId
  const threadId = `draft-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create the draft request
  console.log("[handleCreateDraft] Creating draft in database")
  const draft = await prisma.request.create({
    data: {
      organizationId,
      taskInstanceId,
      entityId,
      userId,
      threadId,
      campaignName: subject,
      campaignType: "SCHEDULED_REQUEST" as any,
      status: "NO_REPLY",
      isDraft: true,

      // Store content directly (no source request to copy from)
      draftEditedSubject: subject,
      draftEditedBody: bodyContent,
      draftEditedHtmlBody: htmlBody || null,

      // Schedule config
      scheduleConfig: scheduleConfig || null,
      scheduledSendAt,
      deadlineDate: scheduledSendAt || taskInstance.dueDate,

      // Reminder config (disabled for scheduled drafts for now)
      remindersEnabled: false, // remindersEnabled,
      remindersFrequencyHours: null, // remindersFrequencyHours || 168,
      remindersMaxCount: null, // remindersMaxCount || 3,
      remindersApproved: false
    } as any,
    include: {
      entity: {
        select: { id: true, firstName: true, lastName: true, email: true }
      }
    }
  })

  console.log("[handleCreateDraft] Draft created successfully", { draftId: draft.id, scheduledSendAt: draft.scheduledSendAt })

    return NextResponse.json({
      success: true,
      message: "Draft request created",
      draft: {
        id: draft.id,
        entityId: draft.entityId,
        entity: (draft as any).entity,
        subject,
        body: bodyContent,
        scheduleConfig,
        scheduledSendAt: draft.scheduledSendAt,
        isDraft: true,
        createdAt: draft.createdAt
      }
    })
  } catch (error: any) {
    console.error("[handleCreateDraft] Error creating draft:", error)
    return NextResponse.json(
      { error: "Failed to create scheduled request" },
      { status: 500 }
    )
  }
}

