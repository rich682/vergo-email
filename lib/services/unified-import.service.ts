import { GroupService } from "@/lib/services/group.service"
import { EntityService } from "@/lib/services/entity.service"
import { ContactType } from "@prisma/client"
import * as XLSX from "xlsx"

type ParsedRow = {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  companyName?: string
  contactType?: string
  groups: string[]
  customFields: Record<string, any>
  customFieldsRaw: Record<string, string | null>
}

export type ImportSummary = {
  contactsCreated: number
  contactsUpdated: number
  groupsCreated: number
  typesCreated: number
  customFieldsCreated: number
  customFieldsUpdated: number
  customFieldsDeleted: number
  skipped: number
  skippedMissingEmail: number
  totalRows: number
  rowsWithEmail: number
  distinctEmailsProcessed: number
  headers: string[]
  skippedSamples: Array<{ rowNumber: number; reason: string }>
  sampleMissingEmailRowNumbers: number[]
  ignoredColumns: string[]
}

const CORE_FIELDS = [
  "email",
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "phone",
  "company",
  "companyname",
  "company_name",
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
  const normalizedHeaders = headers.map(normalizeHeader)

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
    const customFieldsRaw: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(normalizedEntries)) {
      if (!CORE_FIELDS.includes(key)) {
        const rawString = value === undefined || value === null ? null : value.toString().trim()
        customFieldsRaw[key] = rawString
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
      companyName: normalizedEntries["company"] || normalizedEntries["companyname"] || normalizedEntries["company_name"] || undefined,
      contactType: normalizedEntries["type"]
        ? normalizedEntries["type"].toString().toUpperCase()
        : undefined,
      groups,
      customFields,
      customFieldsRaw
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
  // Maximum file size for imports (5MB)
  static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

  static async importContacts(
    file: File,
    organizationId: string,
    options?: { syncCustomFields?: boolean; coreFieldsOnly?: boolean }
  ): Promise<ImportSummary> {
    // Check file size limit
    if (file.size > UnifiedImportService.MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
      throw new Error(`File too large (${sizeMB}MB). Maximum allowed size is 5MB. Please split the file or remove extra columns.`)
    }

    const buffer = await file.arrayBuffer()
    const { rows, headers } = parseWorkbook(buffer)
    const syncCustomFields = options?.syncCustomFields === true
    const coreFieldsOnly = options?.coreFieldsOnly === true

    // Identify ignored columns (non-core fields when coreFieldsOnly is true)
    const normalizedHeaders = headers.map(normalizeHeader)
    const ignoredColumns: string[] = coreFieldsOnly
      ? headers.filter((h, idx) => {
          const norm = normalizedHeaders[idx]
          return norm && !CORE_FIELDS.includes(norm)
        })
      : []

    const summary: ImportSummary = {
      contactsCreated: 0,
      contactsUpdated: 0,
      groupsCreated: 0,
      typesCreated: 0,
      customFieldsCreated: 0,
      customFieldsUpdated: 0,
      customFieldsDeleted: 0,
      skipped: 0,
      skippedMissingEmail: 0,
      totalRows: rows.length,
      rowsWithEmail: 0,
      distinctEmailsProcessed: 0,
      headers,
      skippedSamples: [],
      sampleMissingEmailRowNumbers: [],
      ignoredColumns
    }

    if (!normalizedHeaders.some((h) => h === "email")) {
      throw new Error("Missing required column: email")
    }

    // Only process custom fields if not in coreFieldsOnly mode
    const customFieldColumns = coreFieldsOnly
      ? []
      : normalizedHeaders.filter((h) => h && !CORE_FIELDS.includes(h))

    const seenEmails = new Set<string>()

    const existingGroups = await GroupService.findByOrganization(organizationId)
    const groupMap = new Map<string, string>()
    existingGroups.forEach((g) => groupMap.set(g.name.toLowerCase(), g.id))

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      const rowNumber = idx + 2 // sheet_to_json drops header row; data starts at 2

      if (!row.email) {
        summary.skipped += 1
        summary.skippedMissingEmail += 1
        if (summary.skippedSamples.length < 10) {
          summary.skippedSamples.push({ rowNumber, reason: "Missing email" })
        }
        if (summary.sampleMissingEmailRowNumbers.length < 10) {
          summary.sampleMissingEmailRowNumbers.push(rowNumber)
        }
        continue
      }

      summary.rowsWithEmail += 1
      const emailKey = row.email.toLowerCase()
      if (!seenEmails.has(emailKey)) {
        seenEmails.add(emailKey)
        summary.distinctEmailsProcessed = seenEmails.size
      }

      const normalizedType = normalizeContactType(row.contactType)

      const existing = await EntityService.findByEmail(row.email, organizationId)
      let entity = existing

      if (!existing) {
        const contactTypeData =
          normalizedType.provided
            ? {
                contactType: normalizedType.contactType,
                contactTypeCustomLabel: normalizedType.contactTypeCustomLabel ?? undefined
              }
            : {}
        const created = await EntityService.create({
          firstName: row.firstName || row.lastName || row.email.split("@")[0],
          lastName: row.lastName || undefined,
          email: row.email,
          phone: row.phone,
          companyName: row.companyName || undefined,
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
          lastName: row.lastName || existing.lastName || undefined,
          phone: row.phone || existing.phone,
          companyName: row.companyName || existing.companyName || undefined,
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

      // Note: Custom fields (ContactState) have been removed.
      // Item-scoped labels (JobLabel/JobContactLabel) are now used instead.
    }

    return summary
  }
}
