/**
 * GET /api/reconciliations/[configId]/debug
 * Returns diagnostic data about the config and its latest run.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ configId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { configId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "No permission" }, { status: 403 })
  }

  const config = await prisma.reconciliationConfig.findFirst({
    where: { id: configId, organizationId: session.user.organizationId, deletedAt: null },
  })
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const latestRun = await prisma.reconciliationRun.findFirst({
    where: { configId },
    orderBy: { createdAt: "desc" },
  })

  const sourceAConfig = config.sourceAConfig as any
  const sourceBConfig = config.sourceBConfig as any
  const matchingRules = config.matchingRules as any

  const sourceARows = (latestRun?.sourceARows as any[]) || []
  const sourceBRows = (latestRun?.sourceBRows as any[]) || []

  return NextResponse.json({
    config: {
      name: config.name,
      sourceType: config.sourceType,
      matchingRules,
      sourceAConfig: {
        label: sourceAConfig?.label,
        columns: sourceAConfig?.columns?.map((c: any) => ({ key: c.key, label: c.label, type: c.type })),
      },
      sourceBConfig: {
        label: sourceBConfig?.label,
        columns: sourceBConfig?.columns?.map((c: any) => ({ key: c.key, label: c.label, type: c.type })),
      },
    },
    latestRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      sourceAFileName: latestRun.sourceAFileName,
      sourceBFileName: latestRun.sourceBFileName,
      totalSourceA: latestRun.totalSourceA,
      totalSourceB: latestRun.totalSourceB,
      matchedCount: latestRun.matchedCount,
      exceptionCount: latestRun.exceptionCount,
      sourceARowCount: sourceARows.length,
      sourceBRowCount: sourceBRows.length,
      sourceASampleKeys: sourceARows[0] ? Object.keys(sourceARows[0]) : [],
      sourceBSampleKeys: sourceBRows[0] ? Object.keys(sourceBRows[0]) : [],
      sourceASample: sourceARows.slice(0, 3),
      sourceBSample: sourceBRows.slice(0, 3),
    } : null,
  })
}
