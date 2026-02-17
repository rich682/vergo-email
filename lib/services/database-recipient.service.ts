/**
 * Database Recipient Resolution Service
 *
 * Resolves recipients from database rows by extracting emails from a specified
 * column, applying inline filters, and building personalization data from
 * all row columns (each column label becomes a template tag).
 */

import { prisma } from "@/lib/prisma"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DatabaseRowFilter {
  columnKey: string
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_empty" | "is_empty"
  value?: string | number | boolean
}

export interface DatabaseRecipient {
  email: string
  name?: string
  personalizationData: Record<string, string>
}

export interface DatabaseExcludedRecipient {
  rowIndex: number
  reason: "missing_email" | "invalid_email" | "duplicate_email"
  email?: string
}

export interface DatabaseRecipientResult {
  recipients: DatabaseRecipient[]
  excluded: DatabaseExcludedRecipient[]
  availableTags: string[]
}

interface SchemaColumn {
  key: string
  label: string
  dataType: string
  required: boolean
  order: number
}

// ─── Core Resolution ────────────────────────────────────────────────────────

/**
 * Resolve recipients from a database by filtering rows and extracting emails.
 *
 * Every column in the database becomes an available personalization tag, keyed
 * by column label. The template renderer's normalizeTagName() handles case/format
 * variations, so {{Invoice Number}} will match a column labeled "Invoice Number".
 */
export async function resolveDatabaseRecipients(
  organizationId: string,
  databaseId: string,
  emailColumnKey: string,
  nameColumnKey: string | undefined,
  filters: DatabaseRowFilter[]
): Promise<DatabaseRecipientResult> {
  const database = await prisma.database.findFirst({
    where: { id: databaseId, organizationId },
    select: { schema: true, rows: true },
  })

  if (!database) {
    throw new Error(`Database ${databaseId} not found`)
  }

  const schema = database.schema as { columns?: SchemaColumn[] } | null
  const columns = schema?.columns || []
  const allRows = (database.rows || []) as Record<string, unknown>[]

  // Validate that the email column exists
  const emailColumn = columns.find((c) => c.key === emailColumnKey)
  if (!emailColumn) {
    throw new Error(`Email column "${emailColumnKey}" not found in database schema`)
  }

  // Apply filters
  const filteredRows = filters.length > 0
    ? allRows.filter((row) => filters.every((f) => evaluateFilter(row[f.columnKey], f)))
    : allRows

  // Extract recipients
  const seenEmails = new Set<string>()
  const recipients: DatabaseRecipient[] = []
  const excluded: DatabaseExcludedRecipient[] = []
  const availableTags = columns.map((c) => c.label)

  for (let i = 0; i < filteredRows.length; i++) {
    const row = filteredRows[i]
    const rawEmail = row[emailColumnKey]

    // Check email validity
    if (!rawEmail || typeof rawEmail !== "string") {
      excluded.push({ rowIndex: i, reason: "missing_email" })
      continue
    }

    const email = rawEmail.trim().toLowerCase()
    if (!email.includes("@")) {
      excluded.push({ rowIndex: i, reason: "invalid_email", email })
      continue
    }

    if (seenEmails.has(email)) {
      excluded.push({ rowIndex: i, reason: "duplicate_email", email })
      continue
    }
    seenEmails.add(email)

    // Build personalization data from all columns, keyed by column label
    const personalizationData: Record<string, string> = {}
    for (const col of columns) {
      const val = row[col.key]
      personalizationData[col.label] = val != null ? String(val) : ""
    }

    // Add standard tags
    const rawName = nameColumnKey ? String(row[nameColumnKey] || "") : ""
    personalizationData["First Name"] = rawName.split(" ")[0] || ""
    personalizationData["Email"] = email

    recipients.push({
      email,
      name: rawName || undefined,
      personalizationData,
    })
  }

  return { recipients, excluded, availableTags }
}

// ─── Filter Evaluation ──────────────────────────────────────────────────────

function evaluateFilter(
  cellValue: unknown,
  filter: DatabaseRowFilter
): boolean {
  const { operator, value } = filter

  // Handle null/undefined checks
  if (operator === "is_empty") {
    return cellValue === null || cellValue === undefined || String(cellValue).trim() === ""
  }
  if (operator === "not_empty") {
    return cellValue !== null && cellValue !== undefined && String(cellValue).trim() !== ""
  }

  // For other operators, null cells never match
  if (cellValue === null || cellValue === undefined) return false

  switch (operator) {
    case "eq":
      return String(cellValue).toLowerCase() === String(value).toLowerCase()
    case "neq":
      return String(cellValue).toLowerCase() !== String(value).toLowerCase()
    case "gt":
      return Number(cellValue) > Number(value)
    case "lt":
      return Number(cellValue) < Number(value)
    case "gte":
      return Number(cellValue) >= Number(value)
    case "lte":
      return Number(cellValue) <= Number(value)
    case "contains":
      return String(cellValue).toLowerCase().includes(String(value).toLowerCase())
    default:
      return false
  }
}
