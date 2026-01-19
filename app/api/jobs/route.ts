/**
 * Jobs API Endpoints
 * 
 * GET /api/jobs - List jobs for organization
 * POST /api/jobs - Create a new job
 * 
 * Feature Flag: JOBS_UI (for UI visibility, API always available)
 * 
 * Role-Based Access:
 * - ADMIN: Sees all jobs, can use "My Jobs" filter
 * - MEMBER: Only sees jobs they own or collaborate on
 * - VIEWER: Read-only access to owned/collaborated jobs (cannot create)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/lib/services/job.service"
import { JobStatus } from "@prisma/client"
import { isReadOnly } from "@/lib/permissions"

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
    const userRole = (session.user as any).role as string | undefined
    const { searchParams } = new URL(request.url)
    
    const status = searchParams.get("status") as JobStatus | null
    const clientId = searchParams.get("clientId")
    const boardId = searchParams.get("boardId")  // Filter by board
    const myJobs = searchParams.get("myJobs") === "true"  // Filter to user's jobs (for admin)
    const ownerId = searchParams.get("ownerId")
    const tagsParam = searchParams.get("tags")  // Comma-separated tags filter
    const includeArchived = searchParams.get("includeArchived") === "true"  // Show archived jobs
    const limit = searchParams.get("limit")
    const offset = searchParams.get("offset")

    // Parse tags filter
    const tags = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : undefined

    const result = await JobService.findByOrganization(organizationId, {
      userId,  // Pass for role-based filtering
      userRole,  // Pass for role-based filtering
      status: status || undefined,
      clientId: clientId || undefined,
      boardId: boardId || undefined,  // Filter by board
      // "My Jobs" filter: only applies for admin, non-admins are auto-filtered
      ownerId: myJobs ? userId : (ownerId || undefined),
      collaboratorId: myJobs ? userId : undefined,
      tags,  // Filter by tags (ANY match)
      includeArchived,  // Include archived jobs (default: false)
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

    // VIEWER users cannot create jobs
    const userRole = (session.user as any).role as string | undefined
    if (isReadOnly(userRole)) {
      return NextResponse.json(
        { error: "Forbidden - Viewers cannot create tasks" },
        { status: 403 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const body = await request.json()

    const { name, description, clientId, dueDate, labels, tags, ownerId, stakeholders, boardId } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Item name is required" },
        { status: 400 }
      )
    }

    // Build labels object, merging stakeholders if provided
    let finalLabels = labels || {}
    if (stakeholders && Array.isArray(stakeholders)) {
      // Check if "No Stakeholders" placeholder was selected
      const hasNoStakeholdersFlag = stakeholders.some(
        (s: any) => s.type === "contact_type" && s.id === "NONE"
      )
      // Filter out "No Stakeholders" placeholder from actual stakeholders
      const validStakeholders = stakeholders.filter(
        (s: any) => !(s.type === "contact_type" && s.id === "NONE")
      )
      finalLabels = {
        ...finalLabels,
        stakeholders: validStakeholders,
        // Store flag indicating user explicitly chose "no stakeholders needed"
        noStakeholdersNeeded: hasNoStakeholdersFlag
      }
    }

    // Owner defaults to creating user (AI invariant: current user by default)
    const job = await JobService.create({
      organizationId,
      ownerId: ownerId || userId,  // Default to current user
      name: name.trim(),
      description: description?.trim() || undefined,
      clientId: clientId || undefined,
      boardId: boardId || undefined,  // Optional board association
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels: Object.keys(finalLabels).length > 0 ? finalLabels : undefined,
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
