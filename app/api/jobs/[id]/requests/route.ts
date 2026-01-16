/**
 * Job Requests API Endpoint
 * 
 * GET /api/jobs/[id]/requests - Get EmailDrafts (Requests) associated with a Job
 * 
 * Returns a list of EmailDrafts that have jobId set to this job.
 * Tasks are linked directly via jobId.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JobService } from "@/lib/services/job.service"
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
    const { id: jobId } = await params

    // Verify job exists and user has access
    const job = await JobService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await JobService.canUserAccessJob(userId, userRole, job, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Fetch EmailDrafts (Requests) for this job
    const requests = await prisma.emailDraft.findMany({
      where: {
        jobId,
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

    // Get tasks directly by jobId
    const tasks = await prisma.task.findMany({
      where: {
        organizationId,
        jobId
      },
      select: {
        id: true,
        status: true,
        readStatus: true, // Track if recipient has replied
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

    // Match tasks to requests by creation time proximity
    const enrichedRequests = requests.map(request => {
      let requestTasks: typeof tasks = []

      // Match tasks created around the same time as the request was sent
      if (request.sentAt) {
        const sentTime = new Date(request.sentAt).getTime()
        // Tasks created within 5 minutes of the request being sent
        requestTasks = tasks.filter(task => {
          const taskTime = new Date(task.createdAt).getTime()
          return Math.abs(taskTime - sentTime) < 5 * 60 * 1000
        })
      }

      // Get reminder config from first task
      const firstTask = requestTasks[0]
      const reminderConfig = firstTask ? {
        enabled: firstTask.remindersEnabled,
        frequencyHours: firstTask.remindersFrequencyHours,
        maxCount: firstTask.remindersMaxCount
      } : null

      return {
        ...request,
        taskCount: requestTasks.length,
        reminderConfig,
        recipients: requestTasks.map(task => ({
          id: task.id,
          entityId: task.entity?.id,
          name: task.entity ? `${task.entity.firstName}${task.entity.lastName ? ` ${task.entity.lastName}` : ''}` : 'Unknown',
          email: task.entity?.email || 'Unknown',
          status: task.status,
          readStatus: task.readStatus, // 'unread' | 'read' | 'replied'
          hasReplied: task.readStatus === 'replied', // Convenience flag for AI summary
          sentMessage: task.messages[0] ? {
            subject: task.messages[0].subject,
            body: task.messages[0].body,
            sentAt: task.messages[0].createdAt
          } : null
        }))
      }
    })

    return NextResponse.json({
      success: true,
      requests: enrichedRequests
    })

  } catch (error: any) {
    console.error("Get job requests error:", error)
    return NextResponse.json(
      { error: "Failed to get requests", message: error.message },
      { status: 500 }
    )
  }
}
