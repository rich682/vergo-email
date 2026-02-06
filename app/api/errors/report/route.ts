/**
 * Error Reporting API
 * 
 * POST /api/errors/report
 * 
 * Receives frontend errors from error boundaries and global handlers,
 * stores them in the AppError table for the admin dashboard.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { errorMessage, errorStack, componentName, pageUrl, severity, metadata } = body

    if (!errorMessage) {
      return NextResponse.json({ error: "errorMessage is required" }, { status: 400 })
    }

    // Try to get session for org/user context (non-blocking - errors may happen before auth)
    let organizationId: string | null = null
    let userId: string | null = null
    try {
      const session = await getServerSession(authOptions)
      organizationId = session?.user?.organizationId || null
      userId = session?.user?.id || null
    } catch {
      // Session unavailable - that's fine, log the error anyway
    }

    const userAgent = request.headers.get("user-agent") || null

    await prisma.appError.create({
      data: {
        organizationId,
        userId,
        errorMessage: String(errorMessage).substring(0, 2000),
        errorStack: errorStack ? String(errorStack).substring(0, 10000) : null,
        componentName: componentName ? String(componentName).substring(0, 500) : null,
        pageUrl: pageUrl ? String(pageUrl).substring(0, 2000) : null,
        userAgent: userAgent ? userAgent.substring(0, 500) : null,
        severity: severity || "error",
        metadata: metadata || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Don't let error reporting itself cause issues
    console.error("[ErrorReport] Failed to store error:", error?.message)
    return NextResponse.json({ success: false }, { status: 200 }) // Return 200 to not trigger retries
  }
}
