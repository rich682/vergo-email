/**
 * GET /api/reconciliations/templates
 * Returns all available reconciliation templates.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { listTemplates } from "@/lib/services/reconciliation-templates"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({ templates: listTemplates() })
}
