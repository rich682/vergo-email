import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { CSVImportService } from "@/lib/services/csv-import.service"
import { canPerformAction } from "@/lib/permissions"
import { checkRateLimit } from "@/lib/utils/rate-limit"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (!canPerformAction(session.user.role, "contacts:import", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "You do not have permission to import contacts" }, { status: 403 })
  }

  const { allowed } = await checkRateLimit(`upload:bulk:${session.user.id}`, 10)
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const updateExisting = formData.get("updateExisting") === "true"
    const groupIdsJson = formData.get("groupIds") as string | null
    let groupIds: string[] = []
    
    if (groupIdsJson) {
      try {
        groupIds = JSON.parse(groupIdsJson)
        if (!Array.isArray(groupIds)) {
          groupIds = []
        }
      } catch {
        // Invalid JSON, ignore
        groupIds = []
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB)
    const MAX_CSV_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_CSV_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 413 }
      )
    }

    // Read file content
    const csvText = await file.text()

    // Parse CSV
    const rows = CSVImportService.parseCSV(csvText)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV" },
        { status: 400 }
      )
    }

    // Import entities
    const result = await CSVImportService.importEntities(
      rows,
      session.user.organizationId,
      {
        updateExisting,
        groupIds
      }
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error importing CSV:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

