/**
 * Accounting Integration - Config
 *
 * PUT /api/integrations/accounting/config
 * Updates sync configuration (which models to sync, interval).
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const syncConfigSchema = z.object({
  contacts: z.boolean().optional(),
  invoices: z.boolean().optional(),
  accounts: z.boolean().optional(),
  journalEntries: z.boolean().optional(),
  payments: z.boolean().optional(),
  glTransactions: z.boolean().optional(),
  invoiceLineItems: z.boolean().optional(),
})

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const parsed = syncConfigSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid configuration", details: parsed.error.issues },
        { status: 400 }
      )
    }

    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: session.user.organizationId },
    })

    if (!integration || !integration.isActive) {
      return NextResponse.json(
        { error: "No active accounting integration" },
        { status: 400 }
      )
    }

    // Merge with existing config
    const currentConfig = (integration.syncConfig || {}) as Record<string, unknown>
    const updatedConfig = { ...currentConfig, ...parsed.data }

    await prisma.accountingIntegration.update({
      where: { id: integration.id },
      data: { syncConfig: updatedConfig },
    })

    return NextResponse.json({ success: true, syncConfig: updatedConfig })
  } catch (error) {
    console.error("Error updating sync config:", error)
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    )
  }
}
