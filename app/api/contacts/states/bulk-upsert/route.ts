import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ContactStateSource } from "@prisma/client"
import { normalizeEmail } from "@/lib/utils/email"
import { EntityService } from "@/lib/services/entity.service"
import { ContactStateService } from "@/lib/services/contact-state.service"

interface BulkRow {
  email: string
  stateKey?: string
  metadata?: Record<string, any>
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const rows: BulkRow[] = Array.isArray(body.rows) ? body.rows : []
    const createMissingContacts: boolean = body.createMissingContacts !== false
    const replaceForStateKey: boolean = body.replaceForStateKey === true
    const stateKeyOverride: string | undefined = body.stateKeyOverride || undefined

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    const orgId = session.user.organizationId
    let contactsCreated = 0
    let statesUpserted = 0
    const errors: string[] = []
    const processedEntityIds: string[] = []
    const targetStateKey = stateKeyOverride || undefined

    for (const row of rows) {
      const emailRaw = row.email || ""
      const email = normalizeEmail(emailRaw)
      if (!email) {
        errors.push(`Missing or invalid email in row: ${JSON.stringify(row)}`)
        continue
      }

      const stateKey = stateKeyOverride || row.stateKey
      if (!stateKey) {
        errors.push(`Missing stateKey for email ${email}`)
        continue
      }

      // Find or create contact
      let entity = await prisma.entity.findFirst({
        where: { organizationId: orgId, email },
      })

      if (!entity && createMissingContacts) {
        entity = await prisma.entity.create({
          data: {
            firstName: email.split("@")[0] || "",
            email,
            organizationId: orgId,
            contactType: "UNKNOWN",
          },
        })
        contactsCreated++
      }

      if (!entity) {
        errors.push(`Contact not found for email ${email}`)
        continue
      }

      processedEntityIds.push(entity.id)

      // Build metadata: take provided metadata or remaining fields if row.metadata absent
      let metadata: Record<string, any> | undefined = undefined
      if (row.metadata && typeof row.metadata === "object") {
        metadata = row.metadata
      } else {
        const meta: Record<string, any> = {}
        for (const [k, v] of Object.entries(row)) {
          if (k === "email" || k === "stateKey") continue
          if (k === "metadata") continue
          meta[k] = v
        }
        metadata = Object.keys(meta).length > 0 ? meta : undefined
      }

      await ContactStateService.upsertState({
        organizationId: orgId,
        entityId: entity.id,
        stateKey,
        metadata,
        source: ContactStateSource.CSV_UPLOAD,
      })
      statesUpserted++
    }

    let statesDeleted = 0
    if (replaceForStateKey && (targetStateKey || rows[0]?.stateKey)) {
      const key = targetStateKey || rows[0].stateKey!
      const deleteResult = await prisma.contactState.deleteMany({
        where: {
          organizationId: orgId,
          stateKey: key,
          entityId: { notIn: processedEntityIds },
        },
      })
      statesDeleted = deleteResult.count
    }

    return NextResponse.json({
      rowsIn: rows.length,
      contactsCreated,
      statesUpserted,
      statesDeleted,
      errors,
    })
  } catch (error: any) {
    console.error("Bulk state upsert error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

