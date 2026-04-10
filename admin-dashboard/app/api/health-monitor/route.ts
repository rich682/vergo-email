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

  // Load test account IDs to exclude from checks
  _testOrgIds = null // reset cache per run
  await getTestOrgIds()

  // Run each category with error isolation
  const categories = [
    checkStuckProcesses,
    checkOrphanedRecords,
    checkSyncHealth,
    checkDataGrowth,
    checkErrorRate,
    checkSecurity,
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

// ── Test account filter ───────────────────────────────────────────────

let _testOrgIds: Set<string> | null = null

async function getTestOrgIds(): Promise<Set<string>> {
  if (_testOrgIds) return _testOrgIds
  const testOrgs = await prisma.organization.findMany({
    where: { isTestAccount: true },
    select: { id: true },
  })
  _testOrgIds = new Set(testOrgs.map((o) => o.id))
  return _testOrgIds
}

function excludeTestOrgs<T extends { organizationId?: string | null }>(items: T[]): T[] {
  if (!_testOrgIds || _testOrgIds.size === 0) return items
  return items.filter((item) => !item.organizationId || !_testOrgIds!.has(item.organizationId))
}

// ── Check implementations ─────────────────────────────────────────────

async function checkStuckProcesses(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const stuckRecRunsRaw = await prisma.reconciliationRun.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: ago(MINUTES(30)) } },
    select: { id: true, organizationId: true, updatedAt: true },
  })
  const stuckRecRuns = excludeTestOrgs(stuckRecRunsRaw)
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

  const stuckDraftsRaw = await prisma.emailDraft.findMany({
    where: { aiGenerationStatus: "processing", updatedAt: { lt: ago(MINUTES(10)) } },
    select: { id: true, organizationId: true, updatedAt: true },
  })
  const stuckDrafts = excludeTestOrgs(stuckDraftsRaw)
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

  const stuckWorkflowsRaw = await prisma.workflowRun.findMany({
    where: { status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] }, startedAt: { lt: ago(HOURS(1)) } },
    select: { id: true, organizationId: true, status: true, startedAt: true },
  })
  const stuckWorkflows = excludeTestOrgs(stuckWorkflowsRaw)
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

  const testIds = await getTestOrgIds()
  const staleSyncRaw = await prisma.connectedEmailAccount.findMany({
    where: { isActive: true, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: ago(HOURS(24)) } }] },
    select: { id: true, email: true, organizationId: true, lastSyncAt: true, provider: true, userId: true },
  })
  // Exclude accounts in test orgs AND accounts owned by users from test orgs (e.g., Vergo staff in customer orgs)
  const ownerUserIds = staleSyncRaw.map((a) => a.userId).filter(Boolean) as string[]
  const ownerUsers = ownerUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: ownerUserIds } }, select: { id: true, organizationId: true } })
    : []
  const testOwnerIds = new Set(ownerUsers.filter((u) => testIds.has(u.organizationId)).map((u) => u.id))
  const staleSync = staleSyncRaw.filter((a) => !testIds.has(a.organizationId) && !(a.userId && testOwnerIds.has(a.userId)))
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

  const expiredTokensRaw = await prisma.connectedEmailAccount.findMany({
    where: { isActive: true, tokenExpiresAt: { lt: new Date() } },
    select: { id: true, email: true, organizationId: true, tokenExpiresAt: true, userId: true },
  })
  // Exclude test org accounts AND accounts owned by test org users
  const expOwnerIds = expiredTokensRaw.map((a) => a.userId).filter(Boolean) as string[]
  const expOwnerUsers = expOwnerIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: expOwnerIds } }, select: { id: true, organizationId: true } })
    : []
  const expTestOwnerIds = new Set(expOwnerUsers.filter((u) => testIds.has(u.organizationId)).map((u) => u.id))
  const expiredTokens = expiredTokensRaw.filter((a) => !testIds.has(a.organizationId) && !(a.userId && expTestOwnerIds.has(a.userId)))
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

  const syncIssuesRaw = await prisma.accountingIntegration.findMany({
    where: { isActive: true, OR: [{ syncStatus: "error" }, { lastSyncAt: { lt: ago(HOURS(48)) } }] },
    select: { id: true, organizationId: true, syncStatus: true, lastSyncAt: true, lastSyncError: true },
  })
  const syncIssues = excludeTestOrgs(syncIssuesRaw)
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

  const testIds = await getTestOrgIds()
  const storageByOrgRaw = await prisma.attachment.groupBy({
    by: ["organizationId"],
    _sum: { fileSize: true },
    _count: true,
    having: { fileSize: { _sum: { gt: ONE_GB } } },
  })
  const storageByOrg = storageByOrgRaw.filter((s) => !testIds.has(s.organizationId))
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
  const testIds = await getTestOrgIds()
  const errorsByOrgRaw = await prisma.appError.groupBy({
    by: ["organizationId"],
    _count: true,
    where: { createdAt: { gte: ago(HOURS(24)) } },
  })
  const errorsByOrg = errorsByOrgRaw.filter((e) => !e.organizationId || !testIds.has(e.organizationId))

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

// ── Security Checks ─────────────────────────────────────────────────

async function checkSecurity(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const testIds = await getTestOrgIds()

  // 1. Users with no password hash (incomplete accounts)
  const noPasswordUsers = await prisma.user.findMany({
    where: { passwordHash: "", emailVerified: true },
    select: { id: true, email: true, organizationId: true, role: true },
  })
  const filteredNoPass = noPasswordUsers.filter((u) => !testIds.has(u.organizationId))
  if (filteredNoPass.length > 0) {
    results.push({
      name: "users_without_passwords",
      category: "security",
      status: "warning",
      message: `${filteredNoPass.length} verified user(s) have no password set`,
      details: filteredNoPass.map((u) => ({ id: u.id, email: u.email, role: u.role })),
      count: filteredNoPass.length,
      diagnostic: "Users marked as email-verified but without a password hash. These accounts cannot log in via credentials but may have been created through an incomplete OAuth flow or a code bug.",
      fix: "Review these accounts. If they're legitimate OAuth users, no action needed. If they should use password login, trigger a password reset email for each affected user.",
    })
  }

  // 2. Admin users per org (flag orgs with many admins)
  const adminsByOrg = await prisma.user.groupBy({
    by: ["organizationId"],
    where: { role: "ADMIN", isDebugUser: false },
    _count: true,
  })
  const manyAdminOrgs = adminsByOrg.filter((g) => g._count > 5 && !testIds.has(g.organizationId))
  if (manyAdminOrgs.length > 0) {
    results.push({
      name: "excessive_admin_users",
      category: "security",
      status: "warning",
      message: `${manyAdminOrgs.length} org(s) have >5 admin users`,
      details: manyAdminOrgs.map((g) => ({ organizationId: g.organizationId, adminCount: g._count })),
      count: manyAdminOrgs.length,
      diagnostic: "Organizations with many admin users increase the attack surface. Each admin has full access to all data, settings, and user management. Best practice is to limit admin accounts to 2-3 per org.",
      fix: "Review admin lists for affected orgs. Downgrade unnecessary admins to MANAGER or MEMBER role. Consider implementing an admin approval workflow.",
    })
  }

  // 3. Debug users in non-test orgs
  const debugUsers = await prisma.user.findMany({
    where: { isDebugUser: true },
    select: { id: true, email: true, organizationId: true },
  })
  const debugInCustomerOrgs = debugUsers.filter((u) => !testIds.has(u.organizationId))
  if (debugInCustomerOrgs.length > 0) {
    results.push({
      name: "debug_users_in_customer_orgs",
      category: "security",
      status: "critical",
      message: `${debugInCustomerOrgs.length} debug user(s) exist in customer organizations`,
      details: debugInCustomerOrgs.map((u) => ({ id: u.id, email: u.email, organizationId: u.organizationId })),
      count: debugInCustomerOrgs.length,
      diagnostic: "Debug users with known/weak passwords exist in real customer organizations. These are backdoor accounts that could be used to access customer financial data. This is a critical security risk.",
      fix: "Immediately delete debug users from customer orgs: DELETE FROM \"User\" WHERE \"isDebugUser\" = true AND \"organizationId\" NOT IN (select id from \"Organization\" where \"isTestAccount\" = true). Then remove the debug user creation code from the signup flow.",
    })
  }

  // 4. Expired or stale verification tokens
  const staleTokens = await prisma.user.count({
    where: {
      verificationToken: { not: null },
      tokenExpiresAt: { lt: new Date() },
    },
  })
  if (staleTokens > 10) {
    results.push({
      name: "stale_verification_tokens",
      category: "security",
      status: "warning",
      message: `${staleTokens} user(s) have expired verification tokens not cleaned up`,
      details: [{ count: staleTokens }],
      count: staleTokens,
      diagnostic: "Expired password reset and invite tokens are still stored in the database. While they can't be used (validation checks expiry), they represent unnecessary sensitive data retention.",
      fix: "Clean up expired tokens: UPDATE \"User\" SET \"verificationToken\" = NULL, \"tokenExpiresAt\" = NULL WHERE \"tokenExpiresAt\" < NOW(). Consider adding this to a scheduled cleanup job.",
    })
  }

  // 5. Public file access (attachment files stored as public)
  results.push({
    name: "public_file_storage",
    category: "security",
    status: "warning",
    message: "Form file uploads are stored with public URL access",
    details: [{ location: "app/api/forms/public/[token]/upload/route.ts", setting: "access: 'public'" }],
    count: 1,
    diagnostic: "Files uploaded through public forms are stored in blob storage with public access. Anyone with the URL can download the file without authentication. For financial documents, this is a data exposure risk.",
    fix: "Change file storage to private access and implement authenticated download routes that verify the user belongs to the file's organization. Update the upload route to use access: 'private' and create a signed URL endpoint for downloads.",
  })

  // 6. Check for orgs without any admin (orphaned orgs)
  const orgsWithoutAdmin = await prisma.organization.findMany({
    where: {
      isTestAccount: false,
      users: { none: { role: "ADMIN", isDebugUser: false } },
    },
    select: { id: true, name: true },
  })
  if (orgsWithoutAdmin.length > 0) {
    results.push({
      name: "orgs_without_admin",
      category: "security",
      status: "critical",
      message: `${orgsWithoutAdmin.length} customer org(s) have no admin user`,
      details: orgsWithoutAdmin.map((o) => ({ organizationId: o.id, orgName: o.name })),
      count: orgsWithoutAdmin.length,
      diagnostic: "Organizations without any admin user cannot manage settings, permissions, or user access. This typically happens when the only admin account is deleted or deactivated.",
      fix: "Promote an existing user to ADMIN role or contact the organization to set up a new admin account.",
    })
  }

  // FIXED: debug_user_backdoor_code — removed in commit e70ae04
  // FIXED: no_login_rate_limiting — added in commit e70ae04

  // 9. CSP allows unsafe-inline and unsafe-eval
  results.push({
    name: "csp_unsafe_directives",
    category: "security",
    status: "warning",
    message: "Content Security Policy allows 'unsafe-inline' and 'unsafe-eval' for scripts",
    details: [{ file: "next.config.js", line: 79, current: "script-src 'self' 'unsafe-inline' 'unsafe-eval'" }],
    count: 1,
    diagnostic: "The CSP header includes 'unsafe-inline' and 'unsafe-eval' which weaken XSS protection. If an attacker can inject HTML (e.g., via a crafted email body that bypasses DOMPurify), they can execute inline scripts. DOMPurify provides defense-in-depth, but CSP is the last line.",
    fix: "Remove 'unsafe-eval' (rarely needed in production). Replace 'unsafe-inline' with nonce-based CSP using Next.js nonce support. Test all pages after change as some third-party scripts may break. Risk to customers: MEDIUM — requires QA pass on all pages.",
  })

  // 10. CSRF disabled in development mode
  results.push({
    name: "csrf_dev_bypass",
    category: "security",
    status: "warning",
    message: "CSRF protection completely disabled in development mode",
    details: [{ file: "lib/utils/csrf.ts", line: 13, code: "if (process.env.NODE_ENV === 'development') return true" }],
    count: 1,
    diagnostic: "The validateOrigin() function skips all CSRF checks when NODE_ENV=development. If a development build is accidentally deployed to production (e.g., wrong build command), CSRF protection is completely absent — any external site could make authenticated requests on behalf of logged-in users.",
    fix: "Remove the dev bypass or replace with a console.warn log. Alternatively, check for a specific CSRF_SKIP_DEV env var that would never be set in production. Risk to customers: ZERO — only changes dev behavior.",
  })

  // 11. Public form user enumeration
  results.push({
    name: "form_user_enumeration",
    category: "security",
    status: "warning",
    message: "Public form endpoints expose internal org user list to unauthenticated visitors",
    details: [{ file: "app/api/forms/public/[token]/route.ts", issue: "Returns all non-debug org users to form fillers" }],
    count: 1,
    diagnostic: "When a form has a 'user' type field, the public form endpoint returns the full list of organization users (names and emails) to unauthenticated external form fillers. This leaks internal team structure and contact information.",
    fix: "Only return users explicitly assigned to the form definition, not all org users. Add a 'formAssignedUsers' relation or filter by a user list defined in the form config. Risk to customers: LOW — only affects forms with user-type fields.",
  })

  // 12. Password policy gaps
  results.push({
    name: "password_policy_gaps",
    category: "security",
    status: "warning",
    message: "No password history enforcement or expiration policy",
    details: [{ gaps: ["Users can reuse old passwords on reset", "No forced password rotation", "No password expiration for admin accounts"] }],
    count: 1,
    diagnostic: "Users can reuse the same password indefinitely after resets. There is no forced password rotation policy. For a platform handling sensitive financial data (credit card statements, AP reports, bank reconciliations), this falls below enterprise security expectations.",
    fix: "1) Store last 5 password hashes in a passwordHistory JSON field on User. Check against them on password reset. 2) Add optional org-level setting for password expiration (e.g., 90 days for admin accounts). Risk to customers: LOW — additive change.",
  })

  // 13. Token type confusion
  results.push({
    name: "token_type_confusion",
    category: "security",
    status: "warning",
    message: "Password reset, invite, and verification tokens share the same database field",
    details: [{ field: "User.verificationToken", sharedBy: ["password reset", "team invite", "email verification"] }],
    count: 1,
    diagnostic: "The User model uses a single 'verificationToken' field for three different purposes: password resets, team invites, and email verification. While each flow checks different conditions (expiry, user state), a theoretical cross-use attack exists — e.g., using a password reset token URL with the invite acceptance endpoint.",
    fix: "Add a 'tokenType' field (enum: 'reset' | 'invite' | 'verify') and validate it in each auth flow. Alternatively, use separate columns: resetToken, inviteToken, verifyToken. Risk to customers: LOW — schema migration with no behavior change for valid flows.",
  })

  return results
}

// ── Static Code Quality Checks ──────────────────────────────────────

async function checkCodeQuality(): Promise<CheckResult[]> {
  // Dynamic code quality checks — track file sizes against frozen baselines.
  // If a file grows beyond its baseline, it means new code was added to an already-oversized file
  // instead of being extracted into a new component.
  const results: CheckResult[] = []

  // Frozen baselines as of April 10, 2026 — these should only ever go DOWN
  const FILE_SIZE_BASELINES: Record<string, number> = {
    "app/dashboard/reports/[id]/page.tsx": 3513,
    "app/dashboard/databases/[id]/page.tsx": 2268,
    "components/jobs/send-request-modal.tsx": 1727,
    "app/dashboard/jobs/[id]/page.tsx": 1633,
    "app/dashboard/boards/page.tsx": 1327,
    "lib/services/board.service.ts": 1329,
    "lib/services/report-execution.service.ts": 1265,
    "components/jobs/reconciliation/reconciliation-results.tsx": 1242,
    "lib/services/form-request.service.ts": 1139,
    "lib/services/accounting-sync.service.ts": 1095,
  }

  // Count actual lines for tracked files
  const fs = require("fs")
  const path = require("path")
  const projectRoot = process.cwd()

  const fileChecks: { file: string; baseline: number; current: number; delta: number }[] = []
  const grownFiles: { file: string; baseline: number; current: number; delta: number }[] = []

  for (const [file, baseline] of Object.entries(FILE_SIZE_BASELINES)) {
    try {
      const filePath = path.join(projectRoot, file)
      const content = fs.readFileSync(filePath, "utf-8")
      const current = content.split("\n").length
      const delta = current - baseline
      fileChecks.push({ file, baseline, current, delta })
      if (delta > 0) {
        grownFiles.push({ file, baseline, current, delta })
      }
    } catch {
      // File might not exist in admin dashboard build context — skip
    }
  }

  if (grownFiles.length > 0) {
    results.push({
      name: "file_size_regression",
      category: "code_quality",
      status: "critical",
      message: `${grownFiles.length} oversized file(s) have GROWN since baseline — new code added to already-bloated files`,
      count: grownFiles.length,
      details: grownFiles,
      diagnostic: "These files were already identified as too large. Adding more code to them makes the problem worse. New features should be extracted into separate components/services, not appended to existing oversized files.",
      fix: "Extract the newly added code into a separate file. Rule: no PR should increase the line count of any file in the baseline list. If you need to add functionality, create a new component and import it.",
    })
  }

  if (fileChecks.length > 0) {
    const shrunkFiles = fileChecks.filter((f) => f.delta < -10)
    const unchangedFiles = fileChecks.filter((f) => f.delta >= -10 && f.delta <= 0)
    const totalDelta = fileChecks.reduce((sum, f) => sum + f.delta, 0)

    results.push({
      name: "oversized_files_tracker",
      category: "code_quality",
      status: grownFiles.length > 0 ? "warning" : "ok",
      message: `${fileChecks.length} tracked files: ${shrunkFiles.length} shrunk, ${unchangedFiles.length} stable, ${grownFiles.length} grown (net ${totalDelta > 0 ? "+" : ""}${totalDelta} lines)`,
      count: fileChecks.length,
      details: fileChecks.sort((a, b) => b.delta - a.delta),
      diagnostic: "Tracking the top oversized files against a frozen baseline from April 10, 2026. Goal: all files should trend toward 500 lines or fewer over time. Negative delta = progress. Positive delta = regression.",
      fix: "When modifying these files, extract new code into child components instead of adding lines. Over time, refactor existing sections out into focused files when touching adjacent code.",
    })
  }

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

  // FIXED: missing_timeout_config — added maxDuration to 6 routes in commit e70ae04
  // FIXED: n_plus_one quest metadata loop — batched in commit 53738cf
  // FIXED: unbounded queries — take: limits added in commit e70ae04

  results.push({
    name: "n_plus_one_accounting_sync",
    category: "code_quality",
    status: "warning",
    message: "N+1 query pattern in accounting sync service — account iteration without batching",
    count: 1,
    details: [
      { file: "lib/services/accounting-sync.service.ts", issue: "Account iteration without batched related queries" },
    ],
    diagnostic: "The accounting sync service iterates over connected accounts and performs individual queries per account instead of batching. As customer count grows, this becomes a performance bottleneck.",
    fix: "Batch account processing with Promise.all for independent operations. Load all accounts, group related queries, process in parallel. Risk to customers: LOW — same logic, just faster.",
  })

  results.push({
    name: "missing_database_indexes",
    category: "code_quality",
    status: "warning",
    message: "4 recommended composite indexes missing from schema",
    count: 4,
    details: [
      { model: "Request", index: "@@index([organizationId, riskLevel])", reason: "Risk filtering in review hub" },
      { model: "Message", index: "@@index([organizationId, reviewStatus, createdAt])", reason: "Review status filtering with date sort" },
      { model: "TaskInstance", index: "@@index([organizationId, ownerId, status])", reason: "Filtered task lists by owner and status" },
      { model: "EmailDraft", index: "@@index([organizationId, status])", reason: "Draft lookup by status" },
    ],
    diagnostic: "Frequently queried field combinations lack composite indexes. As data grows, these queries will do full table scans instead of index lookups, causing slow page loads for task lists, review hub, and draft management.",
    fix: "Add the 4 indexes to prisma/schema.prisma and run 'npx prisma db push'. Postgres creates indexes without blocking reads. Brief write lock during creation (milliseconds at current data sizes). Risk to customers: VERY LOW.",
  })

  return results
}
