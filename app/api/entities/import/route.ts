import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { UnifiedImportService } from "@/lib/services/unified-import.service"
import { canPerformAction } from "@/lib/permissions"
import { checkRateLimit } from "@/lib/utils/rate-limit"

export const maxDuration = 60
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "contacts:import", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "You do not have permission to import contacts" }, { status: 403 })
  }

  const { allowed } = await checkRateLimit(`upload:entity-import:${session.user.id}`, 10)
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  const syncCustomFieldsRaw = formData.get("syncCustomFields")
  const coreFieldsOnlyRaw = formData.get("coreFieldsOnly")
  
  const syncCustomFields =
    typeof syncCustomFieldsRaw === "string"
      ? ["true", "1", "on", "yes"].includes(syncCustomFieldsRaw.toLowerCase())
      : false
  
  const coreFieldsOnly =
    typeof coreFieldsOnlyRaw === "string"
      ? ["true", "1", "on", "yes"].includes(coreFieldsOnlyRaw.toLowerCase())
      : false

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  // Validate file size (max 10MB)
  const MAX_IMPORT_SIZE = 10 * 1024 * 1024
  if (file.size > MAX_IMPORT_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 413 }
    )
  }

  try {
    const summary = await UnifiedImportService.importContacts(
      file,
      session.user.organizationId,
      { syncCustomFields, coreFieldsOnly }
    )

    return NextResponse.json(summary)
  } catch (error: any) {
    console.error("Import error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to import contacts" },
      { status: 400 }
    )
  }
}
