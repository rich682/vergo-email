import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// These are standard Entity fields that shouldn't appear as data personalization options
const EXCLUDED_STATE_KEYS = new Set([
  "firstname",
  "first_name",
  "lastName",
  "lastname",
  "last_name",
  "email",
  "phone",
  "type",
  "groups",
  "contacttype",
  "contact_type"
])

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

  // Filter out standard contact fields
  const filtered = results.filter(
    (row) => !EXCLUDED_STATE_KEYS.has(row.stateKey.toLowerCase())
  )

  return NextResponse.json({
    stateKeys: filtered.map((row) => row.stateKey),
    stateKeysWithCounts: filtered.map((row) => ({
      stateKey: row.stateKey,
      count: row._count.stateKey
    }))
  })
}
