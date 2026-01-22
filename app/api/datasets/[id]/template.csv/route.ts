/**
 * Dataset Template Download API Routes
 * 
 * GET /api/datasets/[id]/template.csv - Download CSV template
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService } from "@/lib/services/dataset.service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await DatasetService.getTemplate(
      params.id,
      session.user.organizationId
    )

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const csvContent = await DatasetService.downloadTemplate(
      params.id,
      session.user.organizationId
    )

    // Generate filename from template name
    const filename = `${template.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_template.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error("Error downloading dataset template:", error)
    return NextResponse.json(
      { error: error.message || "Failed to download template" },
      { status: 500 }
    )
  }
}
