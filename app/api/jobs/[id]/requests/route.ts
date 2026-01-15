/**
 * Job Requests API Endpoint
 * 
 * GET /api/jobs/[id]/requests - Get EmailDrafts (Requests) associated with a Job
 * 
 * Returns a list of EmailDrafts that have jobId set to this job.
 * These represent the "Requests" created within the Job context.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JobService } from "@/lib/services/job.service"
import { UserRole } from "@prisma/client"

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
    console.log(`Fetching requests for job ${jobId}, org ${organizationId}`)
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
        suggestedCampaignName: true,
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

    console.log(`Found ${requests.length} requests for job ${jobId}`)

    // Get task counts for each request (by campaignName)
    const campaignNames = requests
      .map(r => r.suggestedCampaignName)
      .filter((name): name is string => !!name)

    // Get tasks with their details for each campaign
    const tasks = await prisma.task.findMany({
      where: {
        organizationId,
        campaignName: { in: campaignNames }
      },
      select: {
        id: true,
        campaignName: true,
        status: true,
        remindersEnabled: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true,
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

    // Group tasks by campaign name
    const tasksByCampaign = new Map<string, typeof tasks>()
    for (const task of tasks) {
      if (task.campaignName) {
        const existing = tasksByCampaign.get(task.campaignName) || []
        existing.push(task)
        tasksByCampaign.set(task.campaignName, existing)
      }
    }

    // Enrich requests with task details and reminder info
    const enrichedRequests = requests.map(request => {
      const requestTasks = request.suggestedCampaignName 
        ? tasksByCampaign.get(request.suggestedCampaignName) || []
        : []
      
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
