import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { isAuthenticated } from "@/lib/auth"

const prisma = new PrismaClient()

export const dynamic = "force-dynamic"

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
