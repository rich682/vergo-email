/**
 * Admin-only endpoint to check RAG pipeline health and readiness
 * Returns status of database, integrations, and last-seen timestamps
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (session.user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    // Check database connectivity
    let canWriteDb = false
    try {
      await prisma.$queryRaw`SELECT 1`
      canWriteDb = true
    } catch (error) {
      console.error("[Pipeline Status] Database check failed:", error)
    }

    // Check Gmail integration configuration
    const gmailIntegrationConfigured = !!(
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET
    )

    // Check open tracking configuration
    const openTrackingConfigured = !!(
      process.env.TRACKING_BASE_URL || process.env.NEXTAUTH_URL
    )

    // Check reply ingestion configuration
    // Reply ingestion works via webhook (Gmail) or polling (sync service)
    // Webhook requires Gmail integration, polling requires sync service (Inngest)
    const replyIngestionConfigured = !!(
      (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) ||
      process.env.INNGEST_EVENT_KEY
    )

    // Check RAG classifier configuration
    const ragClassifierConfigured = !!(
      process.env.OPENAI_API_KEY
    )

    // Query last-seen timestamps (for this organization only)
    const [lastOpenEvent, lastReplyEvent, lastRagUpdate] = await Promise.all([
      // Last open event: most recent openedAt timestamp
      prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          openedAt: { not: null },
          request: {
            organizationId: session.user.organizationId
          }
        },
        orderBy: { lastOpenedAt: "desc" },
        select: { lastOpenedAt: true }
      }),
      // Last reply event: most recent inbound message
      prisma.message.findFirst({
        where: {
          direction: "INBOUND",
          request: {
            organizationId: session.user.organizationId
          }
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      }),
      // Last RAG update: most recent risk level update
      prisma.request.findFirst({
        where: {
          organizationId: session.user.organizationId,
          riskLevel: { not: undefined }
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true }
      })
    ])

    // Determine overall status
    const allConfigured = 
      canWriteDb &&
      gmailIntegrationConfigured &&
      openTrackingConfigured &&
      replyIngestionConfigured &&
      ragClassifierConfigured

    const status = allConfigured ? "ok" : "degraded"

    return NextResponse.json(
      {
        status,
        checks: {
          canWriteDb,
          gmailIntegrationConfigured,
          openTrackingConfigured,
          replyIngestionConfigured,
          ragClassifierConfigured,
        },
        lastSeen: {
          lastOpenEventAt: lastOpenEvent?.lastOpenedAt?.toISOString() || null,
          lastReplyEventAt: lastReplyEvent?.createdAt?.toISOString() || null,
          lastRagUpdateAt: lastRagUpdate?.updatedAt?.toISOString() || null,
        },
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (error: any) {
    console.error("[Pipeline Status] Error checking pipeline status:", error)
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to check pipeline status",
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}


