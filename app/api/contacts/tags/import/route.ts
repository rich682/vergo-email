import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

// Core fields that should be ignored (not treated as tags)
const CORE_FIELDS = new Set([
  "email",
  "firstname", "first_name", "first name",
  "lastname", "last_name", "last name",
  "phone",
  "type", "contacttype", "contact_type",
  "groups", "group"
])

// Reserved tag names that cannot be created
const RESERVED_TAG_NAMES = new Set([
  "firstname", "first_name", "lastname", "last_name", "email", "phone",
  "type", "groups", "contacttype", "contact_type", "name", "company",
  "address", "city", "state", "zip", "country"
])

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Parse file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "array" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

    if (rows.length < 2) {
      return NextResponse.json({ error: "File must have headers and at least one data row" }, { status: 400 })
    }

    const headers = (rows[0] || []).map((c: any) => (c ? c.toString().trim() : ""))
    const emailIdx = headers.findIndex((h: string) => h.toLowerCase() === "email")

    if (emailIdx === -1) {
      return NextResponse.json({ error: "File must have an EMAIL column" }, { status: 400 })
    }

    // Identify tag columns (non-core fields)
    const tagColumns: { header: string; index: number; normalizedName: string }[] = []
    headers.forEach((h: string, idx: number) => {
      if (!h) return
      const normalized = h.toLowerCase().replace(/\s+/g, "_")
      if (!CORE_FIELDS.has(normalized) && !CORE_FIELDS.has(h.toLowerCase())) {
        tagColumns.push({
          header: h,
          index: idx,
          normalizedName: normalized
        })
      }
    })

    if (tagColumns.length === 0) {
      return NextResponse.json({ 
        error: "No tag columns found. Add columns beyond EMAIL, FIRST_NAME, LAST_NAME." 
      }, { status: 400 })
    }

    // Get or create tags for each tag column
    const tagMap = new Map<string, string>() // normalizedName -> tagId
    let tagsCreated = 0

    for (const col of tagColumns) {
      // Skip reserved names
      if (RESERVED_TAG_NAMES.has(col.normalizedName)) {
        continue
      }

      let tag = await prisma.tag.findFirst({
        where: {
          organizationId,
          name: col.normalizedName
        }
      })

      if (!tag) {
        tag = await prisma.tag.create({
          data: {
            organizationId,
            name: col.normalizedName,
            displayName: col.header // Preserve original casing
          }
        })
        tagsCreated++
      }

      tagMap.set(col.normalizedName, tag.id)
    }

    // Get all entities for this organization (for email lookup)
    const entities = await prisma.entity.findMany({
      where: { organizationId },
      select: { id: true, email: true }
    })
    const emailToEntityId = new Map<string, string>()
    entities.forEach(e => {
      if (e.email) {
        emailToEntityId.set(e.email.toLowerCase(), e.id)
      }
    })

    // Process data rows
    let contactsUpdated = 0
    let tagValuesSet = 0
    let tagValuesRemoved = 0
    const unknownEmails: string[] = []
    const processedEntityIds = new Set<string>()

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      const email = row[emailIdx]?.toString().trim().toLowerCase()
      if (!email) continue

      const entityId = emailToEntityId.get(email)
      if (!entityId) {
        unknownEmails.push(email)
        continue
      }

      // Process each tag column for this contact
      for (const col of tagColumns) {
        const tagId = tagMap.get(col.normalizedName)
        if (!tagId) continue // Skip reserved names

        const cellValue = row[col.index]
        const stringValue = cellValue !== undefined && cellValue !== null && cellValue !== ""
          ? String(cellValue).trim()
          : null

        // Find existing contact state
        const existingState = await prisma.contactState.findFirst({
          where: {
            organizationId,
            entityId,
            tagId
          }
        })

        if (stringValue) {
          // Set or update value
          if (existingState) {
            await prisma.contactState.update({
              where: { id: existingState.id },
              data: { stateValue: stringValue }
            })
          } else {
            await prisma.contactState.create({
              data: {
                organizationId,
                entityId,
                tagId,
                stateKey: col.normalizedName, // For backward compatibility
                stateValue: stringValue
              }
            })
          }
          tagValuesSet++
        } else if (existingState) {
          // Remove value (cell is empty)
          await prisma.contactState.delete({
            where: { id: existingState.id }
          })
          tagValuesRemoved++
        }
      }

      if (!processedEntityIds.has(entityId)) {
        processedEntityIds.add(entityId)
        contactsUpdated++
      }
    }

    return NextResponse.json({
      contactsUpdated,
      tagsCreated,
      tagValuesSet,
      tagValuesRemoved,
      skippedUnknownEmails: unknownEmails.length,
      unknownEmails: unknownEmails.slice(0, 10) // Return first 10 for display
    })

  } catch (error: any) {
    console.error("Tag import error:", error)
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    )
  }
}
