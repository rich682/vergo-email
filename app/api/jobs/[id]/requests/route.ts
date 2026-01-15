/**
 * Job Requests API Endpoint
 * 
 * GET /api/jobs/[id]/requests - Get EmailDrafts (Requests) associated with a Job
 * 
 * Returns a list of EmailDrafts that have jobId set to this job.
 * These represent the "Requests" created within the Job context.
 * 
 * Tasks are now linked directly via jobId (new approach) with fallback to
 * campaignName matching (legacy approach) for backwards compatibility.
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
        suggestedCampaignName: true,  // Legacy - kept for backwards compatibility
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

    // Get tasks directly by jobId (new approach)
    // This is the primary way to find tasks associated with this Item
    const tasksByJobId = await prisma.task.findMany({
      where: {
        organizationId,
        jobId
      },
      select: {
        id: true,
        jobId: true,
        campaignName: true,  // Legacy - kept for grouping fallback
        status: true,
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
          orderBy: { sentAt: "asc" },
          take: 1,
          select: {
            id: true,
            subject: true,
            body: true,
            sentAt: true
          }
        }
      }
    })

    // Legacy fallback: Get tasks by campaignName for older requests
    // that were created before jobId was added to tasks
    const campaignNames = requests
      .map(r => r.suggestedCampaignName)
      .filter((name): name is string => !!name)

    const tasksByCampaignName = campaignNames.length > 0
      ? await prisma.task.findMany({
          where: {
            organizationId,
            jobId: null,  // Only get tasks without jobId (legacy)
            campaignName: { in: campaignNames }
          },
          select: {
            id: true,
            jobId: true,
            campaignName: true,
            status: true,
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
              orderBy: { sentAt: "asc" },
              take: 1,
              select: {
                id: true,
                subject: true,
                body: true,
                sentAt: true
              }
            }
          }
        })
      : []

    // Combine all tasks (deduplicate by id)
    const allTasksMap = new Map<string, typeof tasksByJobId[0]>()
    for (const task of tasksByJobId) {
      allTasksMap.set(task.id, task)
    }
    for (const task of tasksByCampaignName) {
      if (!allTasksMap.has(task.id)) {
        allTasksMap.set(task.id, task)
      }
    }
    const allTasks = Array.from(allTasksMap.values())

    // Group tasks by request
    // For new tasks: match by createdAt proximity to request sentAt
    // For legacy tasks: match by campaignName
    const enrichedRequests = requests.map(request => {
      // Find tasks for this request
      let requestTasks: typeof allTasks = []

      // First, try to match tasks created around the same time as the request was sent
      if (request.sentAt) {
        const sentTime = new Date(request.sentAt).getTime()
        // Tasks created within 5 minutes of the request being sent
        requestTasks = allTasks.filter(task => {
          const taskTime = new Date(task.createdAt).getTime()
          return Math.abs(taskTime - sentTime) < 5 * 60 * 1000 // 5 minutes
        })
      }

      // Fallback: match by campaignName (legacy)
      if (requestTasks.length === 0 && request.suggestedCampaignName) {
        requestTasks = allTasks.filter(task => 
          task.campaignName === request.suggestedCampaignName
        )
      }

      // Get reminder config from first task (all tasks in a request share the same config)
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
          sentMessage: task.messages[0] ? {
            subject: task.messages[0].subject,
            body: task.messages[0].body,
            sentAt: task.messages[0].sentAt
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
