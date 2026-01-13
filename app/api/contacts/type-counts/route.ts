import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get counts for built-in types
  const builtInResults = await prisma.entity.groupBy({
    by: ["contactType"],
    where: { 
      organizationId: session.user.organizationId,
      contactType: { not: "CUSTOM" }
    },
    _count: { contactType: true }
  })

  const builtInCounts: Record<string, number> = {}
  builtInResults.forEach((row) => {
    if (row.contactType) {
      builtInCounts[row.contactType] = row._count.contactType
    }
  })

  // Get custom types with counts
  const customResults = await prisma.entity.groupBy({
    by: ["contactTypeCustomLabel"],
    where: { 
      organizationId: session.user.organizationId,
      contactType: "CUSTOM",
      contactTypeCustomLabel: { not: null }
    },
    _count: { contactTypeCustomLabel: true }
  })

  const customTypes = customResults
    .filter(row => row.contactTypeCustomLabel)
    .map((row) => ({
      label: row.contactTypeCustomLabel!,
      count: row._count.contactTypeCustomLabel
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return NextResponse.json({
    builtInCounts,
    customTypes
  })
}
