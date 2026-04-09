/**
 * HealthMonitorService
 * Runs 16 diagnostic checks across 7 categories to detect production issues
 * before users report them. Called daily via Inngest cron and on-demand via admin API.
 */
import { prisma, prismaWithDeleted } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ReconciliationRunStatus } from "@prisma/client"

// ── Types ─────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string
  category: string
  status: "ok" | "warning" | "critical"
  message: string
  details: Record<string, any>[]
  count: number
}

interface RunResult {
  id: string
  status: string
  summary: string
}

// ── Time helpers ──────────────────────────────────────────────────────

const MINUTES = (n: number) => n * 60 * 1000
const HOURS = (n: number) => n * 60 * 60 * 1000
const DAYS = (n: number) => n * 24 * 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms)

// ── Service ───────────────────────────────────────────────────────────

export class HealthMonitorService {
  private static log = logger.child({ service: "HealthMonitorService" })

  static async runAllChecks(): Promise<RunResult> {
    const startTime = Date.now()
    const results: CheckResult[] = []

    const checkFns = [
      this.checkStuckProcesses,
      this.checkOrphanedRecords,
      this.checkSyncHealth,
      this.checkDataGrowth,
      this.checkErrorRate,
      this.checkUserEngagement,
      this.checkBoardHealth,
    ]

    for (const fn of checkFns) {
      try {
        const categoryResults = await fn.call(this)
        results.push(...categoryResults)
      } catch (err) {
        this.log.error(`Health check category failed: ${fn.name}`, err as Error)
        results.push({
          name: fn.name,
          category: "internal_error",
          status: "warning",
          message: `Check failed internally: ${(err as Error).message}`,
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
    const summary = `${overallStatus.toUpperCase()}: ${results.length} checks, ${issuesFound} issue${issuesFound !== 1 ? "s" : ""} found in ${durationMs}ms`

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

    // Auto-cleanup results older than 90 days
    await prisma.healthCheckResult.deleteMany({
      where: { runAt: { lt: ago(DAYS(90)) } },
    })

    this.log.info("Health check completed", { id: record.id, status: overallStatus, issuesFound, durationMs })
    return { id: record.id, status: overallStatus, summary }
  }

  // ── 1. Stuck Processes ──────────────────────────────────────────────

  private static async checkStuckProcesses(): Promise<CheckResult[]> {
    const results: CheckResult[] = []

    // 1a. Reconciliation runs stuck in PROCESSING
    const stuckRecRuns = await prisma.reconciliationRun.findMany({
      where: {
        status: ReconciliationRunStatus.PROCESSING,
        updatedAt: { lt: ago(MINUTES(30)) },
      },
      select: { id: true, organizationId: true, updatedAt: true, configId: true },
    })
    results.push({
      name: "stuck_reconciliation_runs",
      category: "stuck_processes",
      status: stuckRecRuns.length > 0 ? "critical" : "ok",
      message: stuckRecRuns.length > 0
        ? `${stuckRecRuns.length} reconciliation run(s) stuck in PROCESSING for >30 minutes`
        : "No stuck reconciliation runs",
      details: stuckRecRuns.map((r) => ({ id: r.id, organizationId: r.organizationId, configId: r.configId, stuckSince: r.updatedAt })),
      count: stuckRecRuns.length,
    })

    // 1b. Email drafts stuck in AI generation
    const stuckDrafts = await prisma.emailDraft.findMany({
      where: {
        aiGenerationStatus: "processing",
        updatedAt: { lt: ago(MINUTES(10)) },
      },
      select: { id: true, organizationId: true, updatedAt: true },
    })
    results.push({
      name: "stuck_draft_generation",
      category: "stuck_processes",
      status: stuckDrafts.length > 0 ? "warning" : "ok",
      message: stuckDrafts.length > 0
        ? `${stuckDrafts.length} email draft(s) stuck in AI generation for >10 minutes`
        : "No stuck draft generation",
      details: stuckDrafts.map((d) => ({ id: d.id, organizationId: d.organizationId, stuckSince: d.updatedAt })),
      count: stuckDrafts.length,
    })

    // 1c. Workflow runs stuck in non-terminal status
    const stuckWorkflows = await prisma.workflowRun.findMany({
      where: {
        status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] },
        startedAt: { lt: ago(HOURS(1)) },
      },
      select: { id: true, organizationId: true, status: true, startedAt: true, automationRuleId: true },
    })
    results.push({
      name: "stuck_workflow_runs",
      category: "stuck_processes",
      status: stuckWorkflows.length > 0 ? "critical" : "ok",
      message: stuckWorkflows.length > 0
        ? `${stuckWorkflows.length} workflow run(s) stuck for >1 hour`
        : "No stuck workflow runs",
      details: stuckWorkflows.map((w) => ({ id: w.id, organizationId: w.organizationId, status: w.status, startedAt: w.startedAt })),
      count: stuckWorkflows.length,
    })

    return results
  }

  // ── 2. Orphaned Records ─────────────────────────────────────────────

  private static async checkOrphanedRecords(): Promise<CheckResult[]> {
    const results: CheckResult[] = []

    // 2a. Stale email drafts (DRAFT/APPROVED for >30 days)
    const staleDrafts = await prisma.emailDraft.count({
      where: {
        status: { in: ["DRAFT", "APPROVED"] },
        updatedAt: { lt: ago(DAYS(30)) },
      },
    })
    results.push({
      name: "stale_email_drafts",
      category: "orphaned_records",
      status: staleDrafts > 5 ? "warning" : "ok",
      message: staleDrafts > 0
        ? `${staleDrafts} email draft(s) in DRAFT/APPROVED status for >30 days`
        : "No stale drafts",
      details: staleDrafts > 0 ? [{ count: staleDrafts }] : [],
      count: staleDrafts,
    })

    // 2b. Requests stuck in SEND_FAILED for >7 days
    const failedRequests = await prisma.request.findMany({
      where: {
        status: "SEND_FAILED",
        updatedAt: { lt: ago(DAYS(7)) },
      },
      select: { id: true, organizationId: true, updatedAt: true },
      take: 50,
    })
    results.push({
      name: "stuck_send_failures",
      category: "orphaned_records",
      status: failedRequests.length > 0 ? "warning" : "ok",
      message: failedRequests.length > 0
        ? `${failedRequests.length} request(s) stuck in SEND_FAILED for >7 days`
        : "No stuck send failures",
      details: failedRequests.map((r) => ({ id: r.id, organizationId: r.organizationId, failedSince: r.updatedAt })),
      count: failedRequests.length,
    })

    // 2c. Requests referencing soft-deleted TaskInstances
    const requestsWithTasks = await prisma.request.findMany({
      where: { taskInstanceId: { not: null } },
      select: { id: true, taskInstanceId: true, organizationId: true },
      take: 500,
    })
    const taskIds = [...new Set(requestsWithTasks.map((r) => r.taskInstanceId).filter(Boolean))] as string[]
    let orphanedCount = 0
    if (taskIds.length > 0) {
      const deletedTasks = await prismaWithDeleted.taskInstance.findMany({
        where: { id: { in: taskIds }, deletedAt: { not: null } },
        select: { id: true },
      })
      const deletedTaskIds = new Set(deletedTasks.map((t) => t.id))
      orphanedCount = requestsWithTasks.filter((r) => r.taskInstanceId && deletedTaskIds.has(r.taskInstanceId)).length
    }
    results.push({
      name: "orphaned_requests",
      category: "orphaned_records",
      status: orphanedCount > 0 ? "warning" : "ok",
      message: orphanedCount > 0
        ? `${orphanedCount} request(s) reference deleted tasks`
        : "No orphaned requests",
      details: orphanedCount > 0 ? [{ orphanedCount }] : [],
      count: orphanedCount,
    })

    return results
  }

  // ── 3. Sync Health ──────────────────────────────────────────────────

  private static async checkSyncHealth(): Promise<CheckResult[]> {
    const results: CheckResult[] = []

    // 3a. Email accounts with stale sync
    const staleSync = await prisma.connectedEmailAccount.findMany({
      where: {
        isActive: true,
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lt: ago(HOURS(24)) } },
        ],
      },
      select: { id: true, email: true, organizationId: true, lastSyncAt: true, provider: true },
    })
    results.push({
      name: "stale_email_sync",
      category: "sync_health",
      status: staleSync.length > 0 ? "critical" : "ok",
      message: staleSync.length > 0
        ? `${staleSync.length} active email account(s) haven't synced in >24 hours`
        : "All active email accounts syncing normally",
      details: staleSync.map((a) => ({ id: a.id, email: a.email, organizationId: a.organizationId, lastSyncAt: a.lastSyncAt, provider: a.provider })),
      count: staleSync.length,
    })

    // 3b. Expired OAuth tokens
    const expiredTokens = await prisma.connectedEmailAccount.findMany({
      where: {
        isActive: true,
        tokenExpiresAt: { lt: new Date() },
      },
      select: { id: true, email: true, organizationId: true, tokenExpiresAt: true, provider: true },
    })
    results.push({
      name: "expired_tokens",
      category: "sync_health",
      status: expiredTokens.length > 0 ? "critical" : "ok",
      message: expiredTokens.length > 0
        ? `${expiredTokens.length} email account(s) have expired OAuth tokens`
        : "No expired tokens",
      details: expiredTokens.map((a) => ({ id: a.id, email: a.email, organizationId: a.organizationId, expiredAt: a.tokenExpiresAt })),
      count: expiredTokens.length,
    })

    // 3c. Accounting sync issues
    const syncIssues = await prisma.accountingIntegration.findMany({
      where: {
        isActive: true,
        OR: [
          { syncStatus: "error" },
          { lastSyncAt: { lt: ago(HOURS(48)) } },
        ],
      },
      select: { id: true, organizationId: true, syncStatus: true, lastSyncAt: true, lastSyncError: true },
    })
    results.push({
      name: "accounting_sync_issues",
      category: "sync_health",
      status: syncIssues.length > 0 ? "warning" : "ok",
      message: syncIssues.length > 0
        ? `${syncIssues.length} accounting integration(s) have sync issues`
        : "Accounting syncs healthy",
      details: syncIssues.map((a) => ({ id: a.id, organizationId: a.organizationId, syncStatus: a.syncStatus, lastSyncAt: a.lastSyncAt, error: a.lastSyncError })),
      count: syncIssues.length,
    })

    return results
  }

  // ── 4. Data Growth ──────────────────────────────────────────────────

  private static async checkDataGrowth(): Promise<CheckResult[]> {
    const results: CheckResult[] = []
    const ONE_GB = 1_073_741_824

    // 4a. Storage by org
    const storageByOrg = await prisma.attachment.groupBy({
      by: ["organizationId"],
      _sum: { fileSize: true },
      _count: true,
      having: { fileSize: { _sum: { gt: ONE_GB } } },
    })
    const orgIds = storageByOrg.map((s) => s.organizationId)
    const orgs = orgIds.length > 0
      ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : []
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]))

    results.push({
      name: "storage_by_org",
      category: "data_growth",
      status: storageByOrg.length > 0 ? "warning" : "ok",
      message: storageByOrg.length > 0
        ? `${storageByOrg.length} organization(s) exceed 1GB attachment storage`
        : "No organizations exceeding storage threshold",
      details: storageByOrg.map((s) => ({
        organizationId: s.organizationId,
        orgName: orgNameMap.get(s.organizationId) || "Unknown",
        totalBytes: s._sum.fileSize,
        totalMB: Math.round((s._sum.fileSize || 0) / 1_048_576),
        fileCount: s._count,
      })),
      count: storageByOrg.length,
    })

    // 4b. Row counts per org (flag >50K combined)
    const ROW_THRESHOLD = 50_000
    const [taskCounts, requestCounts, messageCounts] = await Promise.all([
      prisma.taskInstance.groupBy({ by: ["organizationId"], _count: true }),
      prisma.request.groupBy({ by: ["organizationId"], _count: true }),
      prisma.message.groupBy({ by: ["organizationId"], _count: true }),
    ])

    const combinedCounts = new Map<string, number>()
    for (const t of taskCounts) combinedCounts.set(t.organizationId, (combinedCounts.get(t.organizationId) || 0) + t._count)
    for (const r of requestCounts) combinedCounts.set(r.organizationId, (combinedCounts.get(r.organizationId) || 0) + r._count)
    for (const m of messageCounts) combinedCounts.set(m.organizationId, (combinedCounts.get(m.organizationId) || 0) + m._count)

    const highRowOrgs = [...combinedCounts.entries()].filter(([, count]) => count > ROW_THRESHOLD)
    results.push({
      name: "row_counts",
      category: "data_growth",
      status: highRowOrgs.length > 0 ? "warning" : "ok",
      message: highRowOrgs.length > 0
        ? `${highRowOrgs.length} organization(s) exceed ${ROW_THRESHOLD.toLocaleString()} combined rows`
        : "Row counts within threshold",
      details: highRowOrgs.map(([orgId, count]) => ({ organizationId: orgId, combinedRows: count })),
      count: highRowOrgs.length,
    })

    // 4c. Oversized JSON fields (sample check)
    const ONE_MB = 1_048_576
    const recentRuns = await prisma.reconciliationRun.findMany({
      where: { matchResults: { not: null } },
      select: { id: true, organizationId: true, matchResults: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    })
    const oversizedRuns = recentRuns.filter((r) => JSON.stringify(r.matchResults).length > ONE_MB)

    results.push({
      name: "oversized_json",
      category: "data_growth",
      status: oversizedRuns.length > 0 ? "warning" : "ok",
      message: oversizedRuns.length > 0
        ? `${oversizedRuns.length} reconciliation run(s) have matchResults >1MB`
        : "No oversized JSON fields detected",
      details: oversizedRuns.map((r) => ({ id: r.id, organizationId: r.organizationId, sizeBytes: JSON.stringify(r.matchResults).length })),
      count: oversizedRuns.length,
    })

    return results
  }

  // ── 5. Error Rate ───────────────────────────────────────────────────

  private static async checkErrorRate(): Promise<CheckResult[]> {
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
    }]
  }

  // ── 6. User Engagement ──────────────────────────────────────────────

  private static async checkUserEngagement(): Promise<CheckResult[]> {
    const results: CheckResult[] = []

    // 6a. Dormant admin users
    const dormantAdmins = await prisma.user.findMany({
      where: {
        role: "ADMIN",
        isDebugUser: false,
        OR: [
          { lastLoginAt: null },
          { lastLoginAt: { lt: ago(DAYS(30)) } },
        ],
      },
      select: { id: true, email: true, organizationId: true, lastLoginAt: true },
    })
    results.push({
      name: "dormant_admins",
      category: "user_engagement",
      status: dormantAdmins.length > 0 ? "warning" : "ok",
      message: dormantAdmins.length > 0
        ? `${dormantAdmins.length} admin user(s) haven't logged in for >30 days`
        : "All admin users active",
      details: dormantAdmins.map((u) => ({ id: u.id, email: u.email, organizationId: u.organizationId, lastLoginAt: u.lastLoginAt })),
      count: dormantAdmins.length,
    })

    // 6b. Inactive organizations (no login in 14 days)
    const activeOrgIds = await prisma.user.groupBy({
      by: ["organizationId"],
      where: {
        isDebugUser: false,
        lastLoginAt: { gte: ago(DAYS(14)) },
      },
    })
    const activeOrgIdSet = new Set(activeOrgIds.map((o) => o.organizationId))

    const allOrgs = await prisma.organization.findMany({
      select: { id: true, name: true },
    })
    const inactiveOrgs = allOrgs.filter((o) => !activeOrgIdSet.has(o.id))

    results.push({
      name: "inactive_orgs",
      category: "user_engagement",
      status: inactiveOrgs.length > 0 ? "warning" : "ok",
      message: inactiveOrgs.length > 0
        ? `${inactiveOrgs.length} organization(s) with no user login in 14 days`
        : "All organizations have recent activity",
      details: inactiveOrgs.map((o) => ({ organizationId: o.id, orgName: o.name })),
      count: inactiveOrgs.length,
    })

    return results
  }

  // ── 7. Board Health ─────────────────────────────────────────────────

  private static async checkBoardHealth(): Promise<CheckResult[]> {
    const overdueBoards = await prisma.board.findMany({
      where: {
        status: "IN_PROGRESS",
        periodEnd: { lt: new Date() },
        closedAt: null,
      },
      select: { id: true, name: true, organizationId: true, periodEnd: true },
    })

    return [{
      name: "overdue_boards",
      category: "board_health",
      status: overdueBoards.length > 0 ? "warning" : "ok",
      message: overdueBoards.length > 0
        ? `${overdueBoards.length} board(s) past period end but still IN_PROGRESS`
        : "No overdue boards",
      details: overdueBoards.map((b) => ({ id: b.id, name: b.name, organizationId: b.organizationId, periodEnd: b.periodEnd })),
      count: overdueBoards.length,
    }]
  }
}
