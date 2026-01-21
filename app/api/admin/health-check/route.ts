/**
 * GET /api/admin/health-check
 * Comprehensive health check endpoint for all services
 * 
 * Checks:
 * - Database connectivity
 * - Gmail OAuth status
 * - Microsoft OAuth status
 * - OpenAI API key
 * - Inngest configuration
 * - Resend email configuration
 * - Storage configuration
 * - Recent sync activity
 * - Task/Request statistics
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

export const dynamic = "force-dynamic"

interface HealthCheck {
  name: string
  status: "ok" | "warning" | "error"
  message: string
  details?: any
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const organizationId = session.user.organizationId
  const checks: HealthCheck[] = []
  const startTime = Date.now()

  // 1. Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.push({
      name: "database",
      status: "ok",
      message: "Database connection successful"
    })
  } catch (error: any) {
    checks.push({
      name: "database",
      status: "error",
      message: "Database connection failed",
      details: error.message
    })
  }

  // 2. Gmail OAuth status
  try {
    const gmailAccounts = await prisma.connectedEmailAccount.findMany({
      where: {
        organizationId,
        provider: "GMAIL",
        isActive: true
      },
      select: {
        id: true,
        email: true,
        lastSyncAt: true,
        tokenExpiresAt: true
      }
    })

    if (gmailAccounts.length === 0) {
      checks.push({
        name: "gmail_oauth",
        status: "warning",
        message: "No Gmail accounts connected",
        details: { count: 0 }
      })
    } else {
      const expiredCount = gmailAccounts.filter(
        a => a.tokenExpiresAt && new Date(a.tokenExpiresAt) < new Date()
      ).length
      
      checks.push({
        name: "gmail_oauth",
        status: expiredCount > 0 ? "warning" : "ok",
        message: expiredCount > 0 
          ? `${gmailAccounts.length} Gmail account(s), ${expiredCount} with expired tokens`
          : `${gmailAccounts.length} Gmail account(s) connected`,
        details: {
          count: gmailAccounts.length,
          expiredTokens: expiredCount,
          accounts: gmailAccounts.map(a => ({
            email: a.email,
            lastSync: a.lastSyncAt?.toISOString()
          }))
        }
      })
    }
  } catch (error: any) {
    checks.push({
      name: "gmail_oauth",
      status: "error",
      message: "Failed to check Gmail accounts",
      details: error.message
    })
  }

  // 3. Microsoft OAuth status
  try {
    const microsoftAccounts = await prisma.connectedEmailAccount.findMany({
      where: {
        organizationId,
        provider: "MICROSOFT",
        isActive: true
      },
      select: {
        id: true,
        email: true,
        lastSyncAt: true,
        tokenExpiresAt: true
      }
    })

    if (microsoftAccounts.length === 0) {
      checks.push({
        name: "microsoft_oauth",
        status: "warning",
        message: "No Microsoft accounts connected",
        details: { count: 0 }
      })
    } else {
      const expiredCount = microsoftAccounts.filter(
        a => a.tokenExpiresAt && new Date(a.tokenExpiresAt) < new Date()
      ).length
      
      checks.push({
        name: "microsoft_oauth",
        status: expiredCount > 0 ? "warning" : "ok",
        message: expiredCount > 0 
          ? `${microsoftAccounts.length} Microsoft account(s), ${expiredCount} with expired tokens`
          : `${microsoftAccounts.length} Microsoft account(s) connected`,
        details: {
          count: microsoftAccounts.length,
          expiredTokens: expiredCount,
          accounts: microsoftAccounts.map(a => ({
            email: a.email,
            lastSync: a.lastSyncAt?.toISOString()
          }))
        }
      })
    }
  } catch (error: any) {
    checks.push({
      name: "microsoft_oauth",
      status: "error",
      message: "Failed to check Microsoft accounts",
      details: error.message
    })
  }

  // 4. OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      // Just check if we can create a client - don't make an actual API call to save costs
      checks.push({
        name: "openai",
        status: "ok",
        message: "OpenAI API key configured"
      })
    } catch (error: any) {
      checks.push({
        name: "openai",
        status: "error",
        message: "OpenAI configuration error",
        details: error.message
      })
    }
  } else {
    checks.push({
      name: "openai",
      status: "error",
      message: "OpenAI API key not configured"
    })
  }

  // 5. Inngest configuration
  if (process.env.INNGEST_EVENT_KEY || process.env.INNGEST_SIGNING_KEY) {
    checks.push({
      name: "inngest",
      status: "ok",
      message: "Inngest configured"
    })
  } else {
    checks.push({
      name: "inngest",
      status: "warning",
      message: "Inngest not configured - background jobs may not run"
    })
  }

  // 6. Resend email configuration
  if (process.env.RESEND_API_KEY) {
    checks.push({
      name: "resend",
      status: "ok",
      message: "Resend email service configured",
      details: {
        fromEmail: process.env.RESEND_FROM_EMAIL || "not set"
      }
    })
  } else {
    checks.push({
      name: "resend",
      status: "warning",
      message: "Resend not configured - auth emails will be logged only"
    })
  }

  // 7. Storage configuration
  if (process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.BLOB_STORAGE_URL) {
    checks.push({
      name: "storage",
      status: "ok",
      message: "Blob storage configured"
    })
  } else {
    checks.push({
      name: "storage",
      status: "warning",
      message: "Blob storage not configured - using local storage"
    })
  }

  // 8. Recent sync activity
  try {
    const recentSync = await prisma.connectedEmailAccount.findFirst({
      where: {
        organizationId,
        lastSyncAt: { not: null }
      },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true, email: true }
    })

    if (recentSync?.lastSyncAt) {
      const minutesAgo = Math.round((Date.now() - recentSync.lastSyncAt.getTime()) / 60000)
      checks.push({
        name: "sync_activity",
        status: minutesAgo > 10 ? "warning" : "ok",
        message: minutesAgo > 10 
          ? `Last sync was ${minutesAgo} minutes ago`
          : `Last sync ${minutesAgo} minute(s) ago`,
        details: {
          lastSyncAt: recentSync.lastSyncAt.toISOString(),
          account: recentSync.email
        }
      })
    } else {
      checks.push({
        name: "sync_activity",
        status: "warning",
        message: "No recent sync activity"
      })
    }
  } catch (error: any) {
    checks.push({
      name: "sync_activity",
      status: "error",
      message: "Failed to check sync activity",
      details: error.message
    })
  }

  // 9. Task/Request statistics
  try {
    const [totalTasks, awaitingTasks, fulfilledTasks, totalJobs] = await Promise.all([
      prisma.task.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId, status: "AWAITING_RESPONSE" } }),
      prisma.task.count({ where: { organizationId, status: "FULFILLED" } }),
      prisma.taskInstance.count({ where: { organizationId } })
    ])

    checks.push({
      name: "statistics",
      status: "ok",
      message: `${totalJobs} tasks, ${totalTasks} requests`,
      details: {
        totalJobs,
        totalRequests: totalTasks,
        awaitingResponse: awaitingTasks,
        fulfilled: fulfilledTasks
      }
    })
  } catch (error: any) {
    checks.push({
      name: "statistics",
      status: "error",
      message: "Failed to fetch statistics",
      details: error.message
    })
  }

  // Calculate overall status
  const hasErrors = checks.some(c => c.status === "error")
  const hasWarnings = checks.some(c => c.status === "warning")
  const overallStatus = hasErrors ? "error" : hasWarnings ? "warning" : "ok"

  const duration = Date.now() - startTime

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    checks,
    summary: {
      total: checks.length,
      ok: checks.filter(c => c.status === "ok").length,
      warnings: checks.filter(c => c.status === "warning").length,
      errors: checks.filter(c => c.status === "error").length
    }
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  })
}
