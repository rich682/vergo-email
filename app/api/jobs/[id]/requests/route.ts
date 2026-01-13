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
    const requests = await prisma.emailDraft.findMany({
      where: {
        jobId,
        organizationId
      },
      select: {
        id: true,
        prompt: true,
        generatedSubject: true,
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

    // Get task counts for each request (by campaignName)
    const campaignNames = requests
      .map(r => r.suggestedCampaignName)
      .filter((name): name is string => !!name)

    const taskCounts = await prisma.task.groupBy({
      by: ['campaignName'],
      where: {
        organizationId,
        campaignName: { in: campaignNames }
      },
      _count: { id: true }
    })

    const taskCountMap = new Map(
      taskCounts.map(tc => [tc.campaignName, tc._count.id])
    )

    // Enrich requests with task counts
    const enrichedRequests = requests.map(request => ({
      ...request,
      taskCount: request.suggestedCampaignName 
        ? taskCountMap.get(request.suggestedCampaignName) || 0 
        : 0
    }))

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
