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
  diagnostic?: string
  fix?: string
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
    checkCodeQuality,
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
  if (stuckRecRuns.length > 0) {
    results.push({
      name: "stuck_reconciliation_runs",
      category: "stuck_processes",
      status: "critical",
      message: `${stuckRecRuns.length} reconciliation run(s) stuck in PROCESSING >30min`,
      details: stuckRecRuns,
      count: stuckRecRuns.length,
      diagnostic: "ReconciliationRun records are in PROCESSING status but haven't been updated in over 30 minutes. The matching engine likely timed out or crashed during execution. Check Vercel function logs for timeout errors on the /api/reconciliations/[configId]/runs/[runId]/match endpoint.",
      fix: "Reset stuck runs to REVIEW status so users can retry: UPDATE \"ReconciliationRun\" SET status = 'REVIEW' WHERE status = 'PROCESSING' AND \"updatedAt\" < NOW() - INTERVAL '30 minutes'. Then investigate why the matching timed out — likely an oversized file or OpenAI API timeout.",
    })
  }

  const stuckDrafts = await prisma.emailDraft.findMany({
    where: { aiGenerationStatus: "processing", updatedAt: { lt: ago(MINUTES(10)) } },
    select: { id: true, organizationId: true, updatedAt: true },
  })
  if (stuckDrafts.length > 0) {
    results.push({
      name: "stuck_draft_generation",
      category: "stuck_processes",
      status: "warning",
      message: `${stuckDrafts.length} draft(s) stuck in AI generation >10min`,
      details: stuckDrafts,
      count: stuckDrafts.length,
      diagnostic: "EmailDraft records have aiGenerationStatus='processing' but haven't progressed. The OpenAI API call for draft generation likely timed out or the Vercel function hit its maxDuration limit.",
      fix: "Reset stuck drafts: UPDATE \"EmailDraft\" SET \"aiGenerationStatus\" = 'failed' WHERE \"aiGenerationStatus\" = 'processing' AND \"updatedAt\" < NOW() - INTERVAL '10 minutes'. Users can then retry generation from the UI.",
    })
  }

  const stuckWorkflows = await prisma.workflowRun.findMany({
    where: { status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] }, startedAt: { lt: ago(HOURS(1)) } },
    select: { id: true, organizationId: true, status: true, startedAt: true },
  })
  if (stuckWorkflows.length > 0) {
    results.push({
      name: "stuck_workflow_runs",
      category: "stuck_processes",
      status: "critical",
      message: `${stuckWorkflows.length} workflow(s) stuck >1hr`,
      details: stuckWorkflows,
      count: stuckWorkflows.length,
      diagnostic: "WorkflowRun records are in a non-terminal status (PENDING/RUNNING/WAITING_APPROVAL) for over 1 hour. The Inngest workflow runner may have failed silently or the step it's waiting on never completed.",
      fix: "Mark stuck runs as failed: UPDATE \"WorkflowRun\" SET status = 'FAILED', \"failureReason\" = 'Timed out after 1 hour' WHERE status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED') AND \"startedAt\" < NOW() - INTERVAL '1 hour'. Check Inngest dashboard for failed function executions.",
    })
  }

  return results
}

async function checkOrphanedRecords(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const staleDrafts = await prisma.emailDraft.count({
    where: { status: { in: ["DRAFT", "APPROVED"] }, updatedAt: { lt: ago(DAYS(30)) } },
  })
  if (staleDrafts > 5) {
    results.push({
      name: "stale_email_drafts",
      category: "orphaned_records",
      status: "warning",
      message: `${staleDrafts} draft(s) in DRAFT/APPROVED >30 days`,
      details: [{ count: staleDrafts }],
      count: staleDrafts,
      diagnostic: "Email drafts that were created or approved but never sent, sitting for over 30 days. These consume database space and may confuse users who encounter old drafts.",
      fix: "Review and delete stale drafts: DELETE FROM \"EmailDraft\" WHERE status IN ('DRAFT', 'APPROVED') AND \"updatedAt\" < NOW() - INTERVAL '30 days'. Or add a scheduled cleanup job to auto-archive drafts older than 30 days.",
    })
  }

  const failedRequests = await prisma.request.count({
    where: { status: "SEND_FAILED", updatedAt: { lt: ago(DAYS(7)) } },
  })
  if (failedRequests > 0) {
    results.push({
      name: "stuck_send_failures",
      category: "orphaned_records",
      status: "warning",
      message: `${failedRequests} request(s) stuck in SEND_FAILED >7 days`,
      details: [{ count: failedRequests }],
      count: failedRequests,
      diagnostic: "Requests that failed to send and were never retried or resolved. Users may not be aware these exist. Common causes: invalid email address, email account disconnected, rate limit hit.",
      fix: "Notify affected users or retry sending. Check the request's email account connection status. For permanently failed requests, update status to allow users to resend from the UI.",
    })
  }

  return results
}

async function checkSyncHealth(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const staleSync = await prisma.connectedEmailAccount.findMany({
    where: { isActive: true, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: ago(HOURS(24)) } }] },
    select: { id: true, email: true, organizationId: true, lastSyncAt: true, provider: true },
  })
  if (staleSync.length > 0) {
    results.push({
      name: "stale_email_sync",
      category: "sync_health",
      status: "critical",
      message: `${staleSync.length} active account(s) haven't synced in >24hrs`,
      details: staleSync,
      count: staleSync.length,
      diagnostic: "Active email accounts are not receiving new emails. The Inngest email sync cron may be failing, the OAuth token may have expired, or the Gmail/Microsoft API is returning errors. Users will not see new inbound messages.",
      fix: "1) Check Inngest dashboard for sync function failures. 2) Verify OAuth tokens haven't expired (see expired_tokens check). 3) Trigger manual sync via /api/admin/sync-gmail-now. 4) Check Vercel function logs for API errors.",
    })
  }

  const expiredTokens = await prisma.connectedEmailAccount.findMany({
    where: { isActive: true, tokenExpiresAt: { lt: new Date() } },
    select: { id: true, email: true, organizationId: true, tokenExpiresAt: true },
  })
  if (expiredTokens.length > 0) {
    results.push({
      name: "expired_tokens",
      category: "sync_health",
      status: "critical",
      message: `${expiredTokens.length} account(s) have expired OAuth tokens`,
      details: expiredTokens,
      count: expiredTokens.length,
      diagnostic: "OAuth access tokens have expired and the refresh token flow is not renewing them. Email sync will fail silently for these accounts. Users need to re-authenticate their email connection.",
      fix: "Notify affected users to reconnect their email account in Settings > Email Accounts. The refresh token may have been revoked by the user or the OAuth app consent may have expired.",
    })
  }

  const syncIssues = await prisma.accountingIntegration.findMany({
    where: { isActive: true, OR: [{ syncStatus: "error" }, { lastSyncAt: { lt: ago(HOURS(48)) } }] },
    select: { id: true, organizationId: true, syncStatus: true, lastSyncAt: true, lastSyncError: true },
  })
  if (syncIssues.length > 0) {
    results.push({
      name: "accounting_sync_issues",
      category: "sync_health",
      status: "warning",
      message: `${syncIssues.length} accounting integration(s) have issues`,
      details: syncIssues,
      count: syncIssues.length,
      diagnostic: "Accounting integrations (Merge.dev) are in error state or haven't synced in 48+ hours. Users may be seeing stale financial data. Check the lastSyncError field for specific API errors.",
      fix: "1) Check Merge.dev dashboard for API issues. 2) Reset sync status: UPDATE \"AccountingIntegration\" SET \"syncStatus\" = 'idle' WHERE \"syncStatus\" = 'error'. 3) Trigger re-sync from the app's accounting settings.",
    })
  }

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
  if (storageByOrg.length > 0) {
    results.push({
      name: "storage_by_org",
      category: "data_growth",
      status: "warning",
      message: `${storageByOrg.length} org(s) exceed 1GB attachment storage`,
      details: storageByOrg.map((s) => ({ organizationId: s.organizationId, totalMB: Math.round((s._sum.fileSize || 0) / 1_048_576), fileCount: s._count })),
      count: storageByOrg.length,
      diagnostic: "Organizations are accumulating large amounts of file storage. This increases blob storage costs and can slow down queries that join to attachments.",
      fix: "Review large orgs for duplicate or obsolete attachments. Consider implementing an attachment retention policy or archival process for files older than 1 year.",
    })
  }

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

  const results: CheckResult[] = []

  if (highErrorOrgs.length > 0) {
    results.push({
      name: "error_rate_24h",
      category: "error_rate",
      status: "critical",
      message: `${highErrorOrgs.length} org(s) with >50 errors in 24h (${totalErrors} total)`,
      details: highErrorOrgs.map((e) => ({ organizationId: e.organizationId, errorCount: e._count })),
      count: highErrorOrgs.length,
      link: "/errors",
      diagnostic: "One or more organizations are generating a high volume of frontend errors. This typically indicates a broken UI flow, a failed deployment, or a backend API returning unexpected responses.",
      fix: "1) Check /errors page filtered by the affected org. 2) Look for patterns in error messages (React hydration errors, ChunkLoadErrors suggest deployment issues). 3) ChunkLoadErrors specifically mean users have stale JS bundles — a hard refresh fixes it, but repeated occurrences suggest cache-control header issues.",
    })
  } else if (totalErrors > 100) {
    results.push({
      name: "error_rate_24h",
      category: "error_rate",
      status: "warning",
      message: `${totalErrors} total errors in last 24 hours across all orgs`,
      details: errorsByOrg.map((e) => ({ organizationId: e.organizationId, errorCount: e._count })),
      count: totalErrors,
      link: "/errors",
      diagnostic: "Elevated error rate across the platform. No single org is spiking, but the aggregate volume is higher than normal.",
      fix: "Review the /errors page for common patterns. Check if a recent deployment introduced regressions.",
    })
  }

  return results
}

// ── Static Code Quality Checks ──────────────────────────────────────

async function checkCodeQuality(): Promise<CheckResult[]> {
  // These are known static findings from codebase audit.
  // They don't change daily but serve as a persistent reminder of tech debt.
  const results: CheckResult[] = []

  results.push({
    name: "oversized_files",
    category: "code_quality",
    status: "warning",
    message: "29 components exceed 400 lines, 17 pages exceed 500 lines",
    count: 46,
    details: [
      { file: "app/dashboard/reports/[id]/page.tsx", lines: 3513 },
      { file: "app/dashboard/databases/[id]/page.tsx", lines: 2268 },
      { file: "components/jobs/send-request-modal.tsx", lines: 1727 },
      { file: "app/dashboard/jobs/[id]/page.tsx", lines: 1633 },
      { file: "lib/services/board.service.ts", lines: 1329 },
      { file: "lib/services/report-execution.service.ts", lines: 1265 },
    ],
    diagnostic: "Large files are harder to test, review, and modify. The top offenders handle multiple concerns in a single file (e.g., reports/[id]/page.tsx manages column config, formulas, filters, preview, and viewers). This increases bug risk when making changes.",
    fix: "Priority splits: 1) reports/[id]/page.tsx -> ReportBuilder + ReportColumnsPanel + ReportFormulasPanel + ReportPreview. 2) send-request-modal.tsx -> SendRequestModal + RecipientSelection + DraftComposition. 3) board.service.ts -> board.service + board-period-calculation.service. Target: no file over 500 lines.",
  })

  results.push({
    name: "type_safety_gaps",
    category: "code_quality",
    status: "warning",
    message: "97 usages of 'any' type across service files",
    count: 97,
    details: [
      { file: "lib/services/report-execution.service.ts", anyCount: 20 },
      { file: "lib/services/attachment-extraction.service.ts", anyCount: 11 },
      { file: "lib/services/email-sending.service.ts", anyCount: 9 },
    ],
    diagnostic: "Excessive use of 'any' bypasses TypeScript's type checking and allows runtime errors that the compiler would otherwise catch. Most common in JSON field handling (Prisma Json type) and error catch blocks.",
    fix: "1) Replace 'catch (error: any)' with 'catch (error)' and use type guards. 2) Create typed interfaces for JSON fields (aiReasoning, customFields, metadata). 3) Use 'unknown' instead of 'any' for untyped data and add runtime validation.",
  })

  results.push({
    name: "missing_test_coverage",
    category: "code_quality",
    status: "warning",
    message: "Major services lack unit tests (~25% coverage)",
    count: 6,
    details: [
      { service: "email-sync.service.ts", lines: 100, tests: 0 },
      { service: "quest.service.ts", lines: 1019, tests: 0 },
      { service: "email-sending.service.ts", lines: 1050, tests: 0 },
      { service: "accounting-sync.service.ts", lines: 1095, tests: 0 },
      { service: "task-instance.service.ts", lines: 763, tests: 0 },
      { service: "reminder-runner.service.ts", lines: 200, tests: 0 },
    ],
    diagnostic: "Critical business logic services have no unit tests. Changes to these services risk introducing regressions that won't be caught until production. Email sync and quest services are particularly high-risk due to their complexity.",
    fix: "Start with highest-impact services: 1) email-sync.service.ts — test sync cursor handling and error recovery. 2) quest.service.ts — test entity resolution and batch processing. 3) email-sending.service.ts — test rate limiting and personalization rendering.",
  })

  results.push({
    name: "missing_timeout_config",
    category: "code_quality",
    status: "warning",
    message: "Most API routes lack explicit timeout configuration (maxDuration)",
    count: 1,
    details: [
      { issue: "Only 4-5 routes set maxDuration. OpenAI API calls in many services have no explicit timeout." },
    ],
    diagnostic: "Without explicit maxDuration, Vercel functions default to 25s (Pro) or 60s (Enterprise). Long-running operations (AI generation, reconciliation matching, email sync) can silently timeout, leaving processes in stuck states.",
    fix: "Add 'export const maxDuration = 60' to all routes that call OpenAI, process files, or trigger background work. Specifically: all /api/reconciliations/ match routes, /api/email-drafts/generate, /api/review/analyze.",
  })

  results.push({
    name: "n_plus_one_query_risks",
    category: "code_quality",
    status: "warning",
    message: "N+1 query patterns detected in quest and accounting sync services",
    count: 3,
    details: [
      { file: "lib/services/quest.service.ts", issue: "Entity resolution in loop instead of batch query" },
      { file: "lib/services/accounting-sync.service.ts", issue: "Account iteration without batched related queries" },
      { file: "lib/services/quest.service.ts", issue: "findMany without take: limit loads all unsent drafts" },
    ],
    diagnostic: "Querying the database inside loops causes N+1 query patterns that scale linearly with data size. A quest with 100 recipients makes 100 individual queries instead of 1 batch query. This will become a performance bottleneck as customer data grows.",
    fix: "1) quest.service.ts: Replace entity loop with batch findMany using { id: { in: entityIds } }. 2) Add 'take: 100' to all findMany calls that don't have explicit pagination. 3) accounting-sync: batch account processing with Promise.all for independent operations.",
  })

  return results
}
