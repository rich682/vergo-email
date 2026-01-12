import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { UnifiedImportService } from "@/lib/services/unified-import.service"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  const syncCustomFieldsRaw = formData.get("syncCustomFields")
  const syncCustomFields =
    typeof syncCustomFieldsRaw === "string"
      ? ["true", "1", "on", "yes"].includes(syncCustomFieldsRaw.toLowerCase())
      : false

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  try {
    const summary = await UnifiedImportService.importContacts(
      file,
      session.user.organizationId,
      { syncCustomFields }
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
