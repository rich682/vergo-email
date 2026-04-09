import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { isAuthenticated } from "@/lib/auth"

const prisma = new PrismaClient()

export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Time helpers ──────────────────────────────────────────────────────

const MINUTES = (n: number) => n * 60 * 1000
const HOURS = (n: number) => n * 60 * 60 * 1000
const DAYS = (n: number) => n * 24 * 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms)

interface CheckResult {
  name: string
  category: string
  status: "ok" | "warning" | "critical"
  message: string
  details: Record<string, any>[]
  count: number
  link?: string
}

// ── GET: Fetch results ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100)

  const results = await prisma.healthCheckResult.findMany({
    orderBy: { runAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ latest: results[0] || null, history: results })
}

// ── POST: Run health checks ──────────────────────────────────────────

export async function POST() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const results: CheckResult[] = []

  // Run each category with error isolation
  const categories = [
    checkStuckProcesses,
    checkOrphanedRecords,
    checkSyncHealth,
    checkDataGrowth,
    checkErrorRate,
  ]

  for (const fn of categories) {
    try {
      results.push(...(await fn()))
    } catch (err: any) {
      results.push({
        name: fn.name,
        category: "internal_error",
        status: "warning",
        message: `Check failed: ${err.message}`,
        details: [],
        count: 0,
      })
    }
  }

  const issuesFound = results.filter((r) => r.status !== "ok").reduce((sum, r) => sum + Math.max(r.count, 1), 0)
  const overallStatus = results.some((r) => r.status === "critical")
    ? "critical"
    : results.some((r) => r.status === "warning")
      ? "warning"
      : "healthy"
  const durationMs = Date.now() - startTime
  const summary = `${overallStatus.toUpperCase()}: ${results.length} checks, ${issuesFound} issue${issuesFound !== 1 ? "s" : ""} in ${durationMs}ms`

  const record = await prisma.healthCheckResult.create({
    data: {
      status: overallStatus,
      checksRun: results.length,
      issuesFound,
      results: results as any,
      summary,
      durationMs,
    },
  })

  // Cleanup old results
  await prisma.healthCheckResult.deleteMany({
    where: { runAt: { lt: ago(DAYS(90)) } },
  })

  return NextResponse.json({ id: record.id, status: overallStatus, summary })
}

// ── Check implementations ─────────────────────────────────────────────

async function checkStuckProcesses(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const stuckRecRuns = await prisma.reconciliationRun.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: ago(MINUTES(30)) } },
    select: { id: true, organizationId: true, updatedAt: true },
  })
  results.push({
    name: "stuck_reconciliation_runs",
    category: "stuck_processes",
    status: stuckRecRuns.length > 0 ? "critical" : "ok",
    message: stuckRecRuns.length > 0 ? `${stuckRecRuns.length} reconciliation run(s) stuck in PROCESSING >30min` : "No stuck reconciliation runs",
    details: stuckRecRuns,
    count: stuckRecRuns.length,
  })

  const stuckDrafts = await prisma.emailDraft.findMany({
    where: { aiGenerationStatus: "processing", updatedAt: { lt: ago(MINUTES(10)) } },
    select: { id: true, organizationId: true, updatedAt: true },
  })
  results.push({
    name: "stuck_draft_generation",
    category: "stuck_processes",
    status: stuckDrafts.length > 0 ? "warning" : "ok",
    message: stuckDrafts.length > 0 ? `${stuckDrafts.length} draft(s) stuck in AI generation >10min` : "No stuck draft generation",
    details: stuckDrafts,
    count: stuckDrafts.length,
  })

  const stuckWorkflows = await prisma.workflowRun.findMany({
    where: { status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] }, startedAt: { lt: ago(HOURS(1)) } },
    select: { id: true, organizationId: true, status: true, startedAt: true },
  })
  results.push({
    name: "stuck_workflow_runs",
    category: "stuck_processes",
    status: stuckWorkflows.length > 0 ? "critical" : "ok",
    message: stuckWorkflows.length > 0 ? `${stuckWorkflows.length} workflow(s) stuck >1hr` : "No stuck workflow runs",
    details: stuckWorkflows,
    count: stuckWorkflows.length,
  })

  return results
}

async function checkOrphanedRecords(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const staleDrafts = await prisma.emailDraft.count({
    where: { status: { in: ["DRAFT", "APPROVED"] }, updatedAt: { lt: ago(DAYS(30)) } },
  })
  results.push({
    name: "stale_email_drafts",
    category: "orphaned_records",
    status: staleDrafts > 5 ? "warning" : "ok",
    message: staleDrafts > 0 ? `${staleDrafts} draft(s) in DRAFT/APPROVED >30 days` : "No stale drafts",
    details: staleDrafts > 0 ? [{ count: staleDrafts }] : [],
    count: staleDrafts,
  })

  const failedRequests = await prisma.request.count({
    where: { status: "SEND_FAILED", updatedAt: { lt: ago(DAYS(7)) } },
  })
  results.push({
    name: "stuck_send_failures",
    category: "orphaned_records",
    status: failedRequests > 0 ? "warning" : "ok",
    message: failedRequests > 0 ? `${failedRequests} request(s) stuck in SEND_FAILED >7 days` : "No stuck send failures",
    details: failedRequests > 0 ? [{ count: failedRequests }] : [],
    count: failedRequests,
  })

  return results
}

async function checkSyncHealth(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const staleSync = await prisma.connectedEmailAccount.findMany({
    where: { isActive: true, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: ago(HOURS(24)) } }] },
    select: { id: true, email: true, organizationId: true, lastSyncAt: true, provider: true },
  })
  results.push({
    name: "stale_email_sync",
    category: "sync_health",
    status: staleSync.length > 0 ? "critical" : "ok",
    message: staleSync.length > 0 ? `${staleSync.length} active account(s) haven't synced in >24hrs` : "All accounts syncing normally",
    details: staleSync,
    count: staleSync.length,
  })

  const expiredTokens = await prisma.connectedEmailAccount.findMany({
    where: { isActive: true, tokenExpiresAt: { lt: new Date() } },
    select: { id: true, email: true, organizationId: true, tokenExpiresAt: true },
  })
  results.push({
    name: "expired_tokens",
    category: "sync_health",
    status: expiredTokens.length > 0 ? "critical" : "ok",
    message: expiredTokens.length > 0 ? `${expiredTokens.length} account(s) have expired OAuth tokens` : "No expired tokens",
    details: expiredTokens,
    count: expiredTokens.length,
  })

  const syncIssues = await prisma.accountingIntegration.findMany({
    where: { isActive: true, OR: [{ syncStatus: "error" }, { lastSyncAt: { lt: ago(HOURS(48)) } }] },
    select: { id: true, organizationId: true, syncStatus: true, lastSyncAt: true, lastSyncError: true },
  })
  results.push({
    name: "accounting_sync_issues",
    category: "sync_health",
    status: syncIssues.length > 0 ? "warning" : "ok",
    message: syncIssues.length > 0 ? `${syncIssues.length} accounting integration(s) have issues` : "Accounting syncs healthy",
    details: syncIssues,
    count: syncIssues.length,
  })

  return results
}

async function checkDataGrowth(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const ONE_GB = 1_073_741_824

  const storageByOrg = await prisma.attachment.groupBy({
    by: ["organizationId"],
    _sum: { fileSize: true },
    _count: true,
    having: { fileSize: { _sum: { gt: ONE_GB } } },
  })
  results.push({
    name: "storage_by_org",
    category: "data_growth",
    status: storageByOrg.length > 0 ? "warning" : "ok",
    message: storageByOrg.length > 0 ? `${storageByOrg.length} org(s) exceed 1GB storage` : "Storage within threshold",
    details: storageByOrg.map((s) => ({ organizationId: s.organizationId, totalMB: Math.round((s._sum.fileSize || 0) / 1_048_576), fileCount: s._count })),
    count: storageByOrg.length,
  })

  return results
}

async function checkErrorRate(): Promise<CheckResult[]> {
  const errorsByOrg = await prisma.appError.groupBy({
    by: ["organizationId"],
    _count: true,
    where: { createdAt: { gte: ago(HOURS(24)) } },
  })

  const totalErrors = errorsByOrg.reduce((sum, e) => sum + e._count, 0)
  const highErrorOrgs = errorsByOrg.filter((e) => e._count > 50)

  return [{
    name: "error_rate_24h",
    category: "error_rate",
    status: highErrorOrgs.length > 0 ? "critical" : totalErrors > 100 ? "warning" : "ok",
    message: highErrorOrgs.length > 0
      ? `${highErrorOrgs.length} org(s) with >50 errors in 24h (${totalErrors} total)`
      : `${totalErrors} error(s) in last 24 hours`,
    details: highErrorOrgs.map((e) => ({ organizationId: e.organizationId, errorCount: e._count })),
    count: highErrorOrgs.length,
    link: "/errors",
  }]
}
