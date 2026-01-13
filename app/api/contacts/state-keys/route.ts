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

// System entity name used for tag placeholders
const SYSTEM_ENTITY_NAME = "__system_tag_holder__"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Find the system entity ID (if exists) to exclude from counts
  const systemEntity = await prisma.entity.findFirst({
    where: {
      organizationId: session.user.organizationId,
      firstName: SYSTEM_ENTITY_NAME
    },
    select: { id: true }
  })

  // Get all unique state keys
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

  // For each tag, get the count excluding the system entity
  const stateKeysWithCounts = await Promise.all(
    filtered.map(async (row) => {
      // Count only real contacts (exclude system entity)
      const realCount = systemEntity
        ? await prisma.contactState.count({
            where: {
              organizationId: session.user.organizationId,
              stateKey: row.stateKey,
              NOT: { entityId: systemEntity.id }
            }
          })
        : row._count.stateKey

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
