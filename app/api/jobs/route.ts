/**
 * Jobs API Endpoints
 * 
 * GET /api/jobs - List jobs for organization
 * POST /api/jobs - Create a new job
 * 
 * Feature Flag: JOBS_UI (for UI visibility, API always available)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/lib/services/job.service"
import { JobStatus } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const { searchParams } = new URL(request.url)
    
    const status = searchParams.get("status") as JobStatus | null
    const clientId = searchParams.get("clientId")
    const limit = searchParams.get("limit")
    const offset = searchParams.get("offset")

    const result = await JobService.findByOrganization(organizationId, {
      status: status || undefined,
      clientId: clientId || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined
    })

    return NextResponse.json({
      success: true,
      jobs: result.jobs,
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
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const body = await request.json()

    const { name, description, clientId, dueDate, labels } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Job name is required" },
        { status: 400 }
      )
    }

    const job = await JobService.create({
      organizationId,
      name: name.trim(),
      description: description?.trim() || undefined,
      clientId: clientId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels: labels || undefined
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
