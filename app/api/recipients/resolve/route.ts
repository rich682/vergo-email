/**
 * Recipient Resolution API
 *
 * POST /api/recipients/resolve
 *
 * Takes a RecipientSourceSelection and returns resolved recipients.
 * - Users mode: expands roleSelections to current users with those roles,
 *   merges with explicitly selected userIds.
 * - Database mode: delegates to database-recipient.service.ts
 *
 * Query param ?countOnly=true returns just the count for preview purposes.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveDatabaseRecipients } from "@/lib/services/database-recipient.service"
import type { RecipientSourceSelection, ResolvedRecipient } from "@/lib/types/recipient-source"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const body = (await request.json()) as RecipientSourceSelection
    const countOnly = request.nextUrl.searchParams.get("countOnly") === "true"

    if (body.mode === "users") {
      return await resolveUsers(organizationId, body, countOnly)
    }

    if (body.mode === "database") {
      return await resolveDatabase(organizationId, body, countOnly)
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  } catch (error: any) {
    console.error("Recipient resolution error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to resolve recipients" },
      { status: 500 }
    )
  }
}

async function resolveUsers(
  organizationId: string,
  selection: RecipientSourceSelection,
  countOnly: boolean
) {
  const { userIds = [], roleSelections = [] } = selection

  // Build where clause: explicit IDs OR matching roles
  const orConditions: any[] = []
  if (userIds.length > 0) {
    orConditions.push({ id: { in: userIds } })
  }
  if (roleSelections.length > 0) {
    orConditions.push({ role: { in: roleSelections } })
  }

  if (orConditions.length === 0) {
    return NextResponse.json({ recipients: [], count: 0 })
  }

  const users = await prisma.user.findMany({
    where: {
      organizationId,
      isDebugUser: false,
      NOT: { email: "" },
      OR: orConditions,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  })

  if (countOnly) {
    return NextResponse.json({ count: users.length })
  }

  const recipients: ResolvedRecipient[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name || u.email,
    source: "user" as const,
    role: u.role,
  }))

  return NextResponse.json({ recipients, count: recipients.length })
}

async function resolveDatabase(
  organizationId: string,
  selection: RecipientSourceSelection,
  countOnly: boolean
) {
  const { databaseId, emailColumnKey, filters = [] } = selection

  if (!databaseId || !emailColumnKey) {
    return NextResponse.json(
      { error: "databaseId and emailColumnKey are required for database mode" },
      { status: 400 }
    )
  }

  const result = await resolveDatabaseRecipients(
    organizationId,
    databaseId,
    emailColumnKey,
    selection.nameColumnKey,
    filters
  )

  if (countOnly) {
    return NextResponse.json({ count: result.recipients.length })
  }

  const recipients: ResolvedRecipient[] = result.recipients.map((r, i) => ({
    id: `db-row-${i}`,
    email: r.email,
    name: r.name || r.email,
    source: "database_row" as const,
    personalizationData: r.personalizationData,
  }))

  return NextResponse.json({
    recipients,
    count: recipients.length,
    excluded: result.excluded,
    availableTags: result.availableTags,
  })
}
