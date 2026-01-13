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

  // Get all state keys with counts, excluding placeholder entries from the count
  const results = await prisma.contactState.groupBy({
    by: ["stateKey"],
    where: { 
      organizationId: session.user.organizationId,
      // Include all entries (including placeholders) to get the tag names
    },
    _count: { stateKey: true },
    orderBy: { _count: { stateKey: "desc" } }
  })

  // Filter out standard contact fields
  const filtered = results.filter(
    (row) => !EXCLUDED_STATE_KEYS.has(row.stateKey.toLowerCase())
  )

  // For each tag, get the actual count excluding placeholder entries
  const stateKeysWithCounts = await Promise.all(
    filtered.map(async (row) => {
      // Count only real entries (not placeholders)
      const realCount = await prisma.contactState.count({
        where: {
          organizationId: session.user.organizationId,
          stateKey: row.stateKey,
          NOT: {
            entityId: { startsWith: "__tag_placeholder__" }
          }
        }
      })
      return {
        stateKey: row.stateKey,
        count: realCount
      }
    })
  )

  return NextResponse.json({
    stateKeys: filtered.map((row) => row.stateKey),
    stateKeysWithCounts
  })
}
