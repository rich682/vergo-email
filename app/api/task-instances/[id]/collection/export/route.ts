import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EvidenceService } from "@/lib/services/evidence.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/task-instances/[id]/collection/export
 * Export collection metadata as CSV
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true, name: true }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Get metadata
    const metadata = await EvidenceService.exportMetadata(jobId, organizationId)

    // Convert to CSV
    const headers = [
      "Filename",
      "Submitted By",
      "Submitter Name",
      "Received At",
      "Source",
      "Status",
      "Reviewed By",
      "Reviewed At",
      "Task/Request",
      "Notes"
    ]

    const escapeCSV = (value: string | null | undefined): string => {
      if (value === null || value === undefined) return ""
      const str = String(value)
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = metadata.map(item => [
      escapeCSV(item.filename),
      escapeCSV(item.submittedBy),
      escapeCSV(item.submittedByName),
      item.receivedAt ? new Date(item.receivedAt).toISOString() : "",
      escapeCSV(item.source),
      escapeCSV(item.status),
      escapeCSV(item.reviewedBy),
      item.reviewedAt ? new Date(item.reviewedAt).toISOString() : "",
      escapeCSV(item.requestName),
      escapeCSV(item.notes)
    ])

    const csv = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n")

    // Sanitize job name for filename
    const safeJobName = job.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50)

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="collection-${safeJobName}-${Date.now()}.csv"`
      }
    })
  } catch (error: any) {
    console.error("Error exporting collection metadata:", error)
    return NextResponse.json(
      { error: "Failed to export metadata", message: error.message },
      { status: 500 }
    )
  }
}
