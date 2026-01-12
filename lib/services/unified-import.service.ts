import { prisma } from "@/lib/prisma"
import { GroupService } from "@/lib/services/group.service"
import { EntityService } from "@/lib/services/entity.service"
import { ContactType } from "@prisma/client"
import * as XLSX from "xlsx"

type ParsedRow = {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  contactType?: string
  groups: string[]
  customFields: Record<string, any>
}

export type ImportSummary = {
  contactsCreated: number
  contactsUpdated: number
  groupsCreated: number
  customFieldsCreated: number
  customFieldsUpdated: number
  skipped: number
  headers: string[]
}

const CORE_FIELDS = [
  "email",
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "phone",
  "type",
  "groups"
]

const CONTACT_TYPE_VALUES = new Set<ContactType>([
  "UNKNOWN",
  "EMPLOYEE",
  "VENDOR",
  "CLIENT",
  "CONTRACTOR",
  "MANAGEMENT",
  "CUSTOM"
])

function normalizeContactType(raw?: string | null): {
  contactType?: ContactType
  contactTypeCustomLabel?: string | null
  provided: boolean
} {
  if (!raw) return { provided: false }
  const trimmed = raw.toString().trim()
  if (!trimmed) return { provided: false }
  const upper = trimmed.toUpperCase()
  if (CONTACT_TYPE_VALUES.has(upper as ContactType)) {
    return {
      contactType: upper as ContactType,
      contactTypeCustomLabel: upper === "CUSTOM" ? trimmed : null,
      provided: true
    }
  }
  console.warn(`Import contacts: unknown contactType "${raw}", coercing to CUSTOM with custom label.`)
  return {
    contactType: "CUSTOM",
    contactTypeCustomLabel: trimmed,
    provided: true
  }
}

function normalizeHeader(header: string): string {
  return header?.trim().toLowerCase()
}

function coerceValue(value: any) {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return value
  const str = String(value).trim()
  if (str === "") return null

  const num = Number(str)
  if (!Number.isNaN(num) && str.match(/^-?\d+(\.\d+)?$/)) {
    return num
  }

  const date = new Date(str)
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString()
  }

  return str
}

function parseWorkbook(buffer: ArrayBuffer): { rows: ParsedRow[]; headers: string[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const json: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

  if (json.length === 0) {
    return { rows: [], headers: [] }
  }

  const headers = Object.keys(json[0] || {}).map((h) => h.toString())

  const rows: ParsedRow[] = json.map((row) => {
    const normalizedEntries = Object.entries(row).reduce<Record<string, any>>((acc, [k, v]) => {
      acc[normalizeHeader(k)] = v
      return acc
    }, {})

    const groupsRaw = normalizedEntries["groups"]
    const groups =
      typeof groupsRaw === "string"
        ? groupsRaw
            .split(",")
            .map((g: string) => g.trim())
            .filter(Boolean)
        : []

    const customFields: Record<string, any> = {}
    for (const [key, value] of Object.entries(normalizedEntries)) {
      if (!CORE_FIELDS.includes(key)) {
        const coerced = coerceValue(value)
        if (coerced !== null) {
          customFields[key] = coerced
        }
      }
    }

    return {
      email: normalizedEntries["email"]?.toString().trim(),
      firstName: normalizedEntries["firstname"] || normalizedEntries["first_name"],
      lastName: normalizedEntries["lastname"] || normalizedEntries["last_name"],
      phone: normalizedEntries["phone"] || undefined,
      contactType: normalizedEntries["type"]
        ? normalizedEntries["type"].toString().toUpperCase()
        : undefined,
      groups,
      customFields
    }
  })

  return { rows, headers }
}

async function addGroupByName(name: string, organizationId: string, groupIds: string[], groupMap: Map<string, string>, summary: ImportSummary) {
  const trimmed = name.trim()
  if (!trimmed) return
  const lower = trimmed.toLowerCase()

  let groupId = groupMap.get(lower)
  if (!groupId) {
    const newGroup = await GroupService.create({
      name: trimmed,
      organizationId,
      color: undefined
    })
    groupId = newGroup.id
    groupMap.set(lower, groupId)
    summary.groupsCreated += 1
  }

  if (!groupIds.includes(groupId)) {
    groupIds.push(groupId)
  }
}

export class UnifiedImportService {
  static async importContacts(file: File, organizationId: string): Promise<ImportSummary> {
    const buffer = await file.arrayBuffer()
    const { rows, headers } = parseWorkbook(buffer)

    const summary: ImportSummary = {
      contactsCreated: 0,
      contactsUpdated: 0,
      groupsCreated: 0,
      customFieldsCreated: 0,
      customFieldsUpdated: 0,
      skipped: 0,
      headers
    }

    if (!headers.some((h) => normalizeHeader(h) === "email")) {
      throw new Error("Missing required column: email")
    }

    const existingGroups = await GroupService.findByOrganization(organizationId)
    const groupMap = new Map<string, string>()
    existingGroups.forEach((g) => groupMap.set(g.name.toLowerCase(), g.id))

    for (const row of rows) {
      if (!row.email) {
        summary.skipped += 1
        continue
      }

      const normalizedType = normalizeContactType(row.contactType)

      const existing = await EntityService.findByEmail(row.email, organizationId)
      let entity = existing

      if (!existing) {
        const contactTypeData =
          normalizedType.provided
            ? {
                contactType: normalizedType.contactType,
                contactTypeCustomLabel: normalizedType.contactTypeCustomLabel ?? null
              }
            : {}
        const created = await EntityService.create({
          firstName: row.firstName || row.lastName || row.email.split("@")[0],
          email: row.email,
          phone: row.phone,
          organizationId,
          ...contactTypeData
        })
        entity = created
        summary.contactsCreated += 1
      } else {
        const contactTypeData =
          normalizedType.provided
            ? {
                contactType: normalizedType.contactType ?? existing.contactType,
                contactTypeCustomLabel:
                  normalizedType.contactTypeCustomLabel ?? null
              }
            : {}
        await EntityService.update(existing.id, organizationId, {
          firstName: row.firstName || existing.firstName,
          phone: row.phone || existing.phone,
          ...contactTypeData
        })
        entity = existing
        summary.contactsUpdated += 1
      }

      if (!entity) continue

      const groupIds: string[] = []
      for (const groupName of row.groups || []) {
        await addGroupByName(groupName, organizationId, groupIds, groupMap, summary)
      }

      for (const gid of groupIds) {
        await EntityService.addToGroup(entity.id, gid)
      }

      // Custom fields -> ContactState upsert
      // Attach lastName as custom field to avoid dropping it
      const customEntries = { ...row.customFields }
      if (row.lastName) {
        customEntries["lastName"] = row.lastName
      }

      for (const [stateKeyRaw, value] of Object.entries(customEntries)) {
        const stateKey = stateKeyRaw.trim()
        if (!stateKey) continue

        const existingField = await prisma.contactState.findUnique({
          where: {
            organizationId_entityId_stateKey: {
              organizationId,
              entityId: entity.id,
              stateKey
            }
          }
        })

        if (existingField) {
          await prisma.contactState.update({
            where: {
              organizationId_entityId_stateKey: {
                organizationId,
                entityId: entity.id,
                stateKey
              }
            },
            data: {
              metadata: value
            }
          })
          summary.customFieldsUpdated += 1
        } else {
          await prisma.contactState.create({
            data: {
              organizationId,
              entityId: entity.id,
              stateKey,
              metadata: value,
              source: "CSV_UPLOAD"
            }
          })
          summary.customFieldsCreated += 1
        }
      }
    }

    return summary
  }
}
