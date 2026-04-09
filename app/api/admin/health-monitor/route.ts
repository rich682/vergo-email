/**
 * GET /api/admin/health-monitor - Fetch latest health monitor results
 * POST /api/admin/health-monitor - Trigger a manual health check run
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { HealthMonitorService } from "@/lib/services/health-monitor.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100)

    const results = await prisma.healthCheckResult.findMany({
      orderBy: { runAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ latest: results[0] || null, history: results })
  } catch (error) {
    console.error("[Health Monitor] Error fetching results:", error)
    return NextResponse.json({ error: "Failed to fetch health results" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const result = await HealthMonitorService.runAllChecks()
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Health Monitor] Error running health check:", error)
    return NextResponse.json({ error: "Failed to run health check" }, { status: 500 })
  }
}
