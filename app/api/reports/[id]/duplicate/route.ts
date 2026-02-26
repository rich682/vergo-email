/**
 * Report Duplicate API
 *
 * POST /api/reports/[id]/duplicate - Duplicate a report definition
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { ReportDefinitionService } from "@/lib/services/report-definition.service"

interface RouteParams {
  params: { id: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json(
        { error: "You do not have permission to manage reports" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "A name is required for the duplicated report" },
        { status: 400 }
      )
    }

    const report = await ReportDefinitionService.duplicateReportDefinition(
      params.id,
      session.user.organizationId,
      name.trim(),
      session.user.id
    )

    return NextResponse.json({ report }, { status: 201 })
  } catch (error: any) {
    console.error("Error duplicating report:", error)
    const message = error?.message || "Failed to duplicate report"
    const status = message.includes("not found") ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
