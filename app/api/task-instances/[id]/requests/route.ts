/**
 * Job Requests API Endpoint
 * 
 * GET /api/task-instances/[id]/requests - Get EmailDrafts (Requests) associated with a Job
 * 
 * Returns a list of EmailDrafts that have jobId set to this job.
 * Tasks are linked directly via jobId.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { UserRole } from "@prisma/client"

export const dynamic = 'force-dynamic'

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
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
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

    // Get requests directly by taskInstanceId
    const requests = await prisma.request.findMany({
      where: {
        organizationId,
        taskInstanceId
      },
      select: {
        id: true,
        status: true,
        readStatus: true,
        remindersEnabled: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true,
        createdAt: true,
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

    // Match requests to emailDrafts by creation time proximity
    const enrichedRequests = emailDrafts.map(draft => {
      let draftRequests: typeof requests = []

      if (draft.sentAt) {
        const sentTime = new Date(draft.sentAt).getTime()
        draftRequests = requests.filter(req => {
          const reqTime = new Date(req.createdAt).getTime()
          return Math.abs(reqTime - sentTime) < 5 * 60 * 1000
        })
      }

      const firstReq = draftRequests[0]
      const reminderConfig = firstReq ? {
        enabled: firstReq.remindersEnabled,
        frequencyHours: firstReq.remindersFrequencyHours,
        maxCount: firstReq.remindersMaxCount
      } : null

      return {
        ...draft,
        taskCount: draftRequests.length,
        reminderConfig,
        recipients: draftRequests.map(req => ({
          id: req.id,
          entityId: req.entity?.id,
          name: req.entity ? `${req.entity.firstName}${req.entity.lastName ? ` ${req.entity.lastName}` : ''}` : 'Unknown',
          email: req.entity?.email || 'Unknown',
          status: req.status,
          readStatus: req.readStatus,
          hasReplied: req.readStatus === 'replied',
          sentMessage: req.messages[0] ? {
            subject: req.messages[0].subject,
            body: req.messages[0].body,
            sentAt: req.messages[0].createdAt
          } : null
        }))
      }
    })

    return NextResponse.json({
      success: true,
      requests: enrichedRequests
    })

  } catch (error: any) {
    console.error("Get task instance requests error:", error)
    return NextResponse.json(
      { error: "Failed to get requests", message: error.message },
      { status: 500 }
    )
  }
}
