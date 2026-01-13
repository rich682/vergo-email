/**
 * Jobs API Endpoints
 * 
 * GET /api/jobs - List jobs for organization
 * POST /api/jobs - Create a new job
 * 
 * Feature Flag: JOBS_UI (for UI visibility, API always available)
 * 
 * Ownership Model:
 * - Jobs are visible org-wide by default
 * - Owner is set to creating user by default
 * - Supports "My Jobs" filter via ownerId/myJobs params
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/lib/services/job.service"
import { JobStatus } from "@prisma/client"

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url)
    
    const status = searchParams.get("status") as JobStatus | null
    const clientId = searchParams.get("clientId")
    const myJobs = searchParams.get("myJobs") === "true"  // Filter to user's jobs
    const ownerId = searchParams.get("ownerId")
    const tagsParam = searchParams.get("tags")  // Comma-separated tags filter
    const limit = searchParams.get("limit")
    const offset = searchParams.get("offset")

    // Parse tags filter
    const tags = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : undefined

    const result = await JobService.findByOrganization(organizationId, {
      status: status || undefined,
      clientId: clientId || undefined,
      // "My Jobs" filter: show jobs where user is owner or collaborator
      ownerId: myJobs ? userId : (ownerId || undefined),
      collaboratorId: myJobs ? userId : undefined,
      tags,  // Filter by tags (ANY match)
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined
    })

    // Map jobs to include effective status (custom status takes precedence)
    const jobsWithEffectiveStatus = result.jobs.map(job => {
      const labels = job.labels as any
      const customStatus = labels?.customStatus || null
      return {
        ...job,
        status: customStatus || job.status
      }
    })

    return NextResponse.json({
      success: true,
      jobs: jobsWithEffectiveStatus,
      total: result.total
    })

  } catch (error: any) {
    console.error("Jobs list error:", error)
    return NextResponse.json(
      { error: "Failed to list jobs", message: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json()

    const { name, description, clientId, dueDate, labels, tags, ownerId } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Item name is required" },
        { status: 400 }
      )
    }

    // Owner defaults to creating user (AI invariant: current user by default)
    const job = await JobService.create({
      organizationId,
      ownerId: ownerId || userId,  // Default to current user
      name: name.trim(),
      description: description?.trim() || undefined,
      clientId: clientId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels: labels || undefined,
      tags: tags || undefined  // Convenience: will be merged into labels.tags
    })

    return NextResponse.json({
      success: true,
      job
    }, { status: 201 })

  } catch (error: any) {
    console.error("Job create error:", error)
    return NextResponse.json(
      { error: "Failed to create job", message: error.message },
      { status: 500 }
    )
  }
}
