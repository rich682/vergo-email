import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results = await prisma.contactState.groupBy({
    by: ["stateKey"],
    where: { organizationId: session.user.organizationId },
    _count: { stateKey: true },
    orderBy: { _count: { stateKey: "desc" } }
  })

  return NextResponse.json(
    results.map((row) => ({
      stateKey: row.stateKey,
      count: row._count.stateKey
    }))
  )
}
