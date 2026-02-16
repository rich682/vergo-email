/**
 * Vendor Database Service
 *
 * Manages system-level Vendor and Customer databases for agent use.
 * Auto-creates databases on first access and provides query methods.
 *
 * These databases are populated by:
 * 1. Accounting sync (Merge.dev contacts with is_supplier/is_customer flags)
 * 2. Manual CSV import via the existing database UI
 * 3. Manual row entry by users
 */

import { prisma } from "@/lib/prisma"
import type {
  DatabaseSchema,
  DatabaseSchemaColumn,
  DatabaseRow,
} from "@/lib/services/database.service"

type SystemDatabaseType = "vendors" | "customers"

const SYSTEM_DB_CONFIGS: Record<
  SystemDatabaseType,
  {
    name: string
    description: string
    sourceType: string
    schema: DatabaseSchema
  }
> = {
  vendors: {
    name: "Vendor Directory",
    description:
      "Vendor and supplier contacts. Populated from accounting integrations or manual entry.",
    sourceType: "system_vendors",
    schema: {
      columns: [
        { key: "name", label: "Name", dataType: "text", required: true, order: 0 },
        { key: "email", label: "Email", dataType: "text", required: false, order: 1 },
        { key: "phone", label: "Phone", dataType: "text", required: false, order: 2 },
        { key: "company", label: "Company", dataType: "text", required: false, order: 3 },
        { key: "category", label: "Category", dataType: "text", required: false, order: 4 },
        {
          key: "payment_terms",
          label: "Payment Terms",
          dataType: "text",
          required: false,
          order: 5,
        },
        { key: "notes", label: "Notes", dataType: "text", required: false, order: 6 },
        {
          key: "merge_remote_id",
          label: "Integration ID",
          dataType: "text",
          required: false,
          order: 7,
        },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },
  customers: {
    name: "Customer Directory",
    description:
      "Customer contacts. Populated from accounting integrations or manual entry.",
    sourceType: "system_customers",
    schema: {
      columns: [
        { key: "name", label: "Name", dataType: "text", required: true, order: 0 },
        { key: "email", label: "Email", dataType: "text", required: false, order: 1 },
        { key: "phone", label: "Phone", dataType: "text", required: false, order: 2 },
        { key: "company", label: "Company", dataType: "text", required: false, order: 3 },
        { key: "category", label: "Category", dataType: "text", required: false, order: 4 },
        { key: "notes", label: "Notes", dataType: "text", required: false, order: 5 },
        {
          key: "merge_remote_id",
          label: "Integration ID",
          dataType: "text",
          required: false,
          order: 6,
        },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },
}

export class VendorDatabaseService {
  /**
   * Find or auto-create the system vendor/customer database for an organization.
   */
  static async ensureSystemDatabase(
    organizationId: string,
    createdById: string,
    type: SystemDatabaseType
  ): Promise<{ id: string; isNew: boolean }> {
    const config = SYSTEM_DB_CONFIGS[type]

    // Check if it already exists
    const existing = await prisma.database.findFirst({
      where: { organizationId, sourceType: config.sourceType },
      select: { id: true },
    })

    if (existing) {
      return { id: existing.id, isNew: false }
    }

    // Create new system database
    const created = await prisma.database.create({
      data: {
        name: config.name,
        description: config.description,
        organizationId,
        schema: config.schema as any,
        identifierKeys: ["name", "company"],
        rows: [],
        rowCount: 0,
        sourceType: config.sourceType,
        isReadOnly: false, // Users can add/edit rows manually
        createdById,
      },
    })

    return { id: created.id, isNew: true }
  }

  /**
   * Upsert contacts into a vendor/customer database.
   * Composite key: lowercase(name + "|||" + company).
   * Updates existing rows with new data, appends new rows.
   */
  static async upsertContacts(
    databaseId: string,
    contacts: Array<{
      name: string
      email?: string
      phone?: string
      company?: string
      category?: string
      payment_terms?: string
      notes?: string
      merge_remote_id?: string
    }>
  ): Promise<{ added: number; updated: number }> {
    const db = await prisma.database.findUnique({
      where: { id: databaseId },
      select: { rows: true },
    })

    if (!db) throw new Error(`Database ${databaseId} not found`)

    const rows = (db.rows as unknown as DatabaseRow[]) || []
    let added = 0
    let updated = 0

    // Build index of existing rows by composite key
    const keyIndex = new Map<string, number>()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const key = `${String(row.name || "").toLowerCase()}|||${String(row.company || "").toLowerCase()}`
      keyIndex.set(key, i)
    }

    // Process incoming contacts
    for (const contact of contacts) {
      if (!contact.name) continue

      const key = `${contact.name.toLowerCase()}|||${(contact.company || "").toLowerCase()}`
      const existingIdx = keyIndex.get(key)

      if (existingIdx !== undefined) {
        // Update existing row — only overwrite non-empty fields
        const existing = rows[existingIdx]
        rows[existingIdx] = {
          ...existing,
          name: contact.name || existing.name,
          email: contact.email || existing.email,
          phone: contact.phone || existing.phone,
          company: contact.company || existing.company,
          category: contact.category || existing.category,
          payment_terms: contact.payment_terms || existing.payment_terms,
          notes: contact.notes || existing.notes,
          merge_remote_id: contact.merge_remote_id || existing.merge_remote_id,
        }
        updated++
      } else {
        // Add new row
        const newRow: DatabaseRow = {
          name: contact.name,
          email: contact.email || null,
          phone: contact.phone || null,
          company: contact.company || null,
          category: contact.category || null,
          payment_terms: contact.payment_terms || null,
          notes: contact.notes || null,
          merge_remote_id: contact.merge_remote_id || null,
        }
        rows.push(newRow)
        keyIndex.set(key, rows.length - 1)
        added++
      }
    }

    // Write back
    await prisma.database.update({
      where: { id: databaseId },
      data: {
        rows: rows as any,
        rowCount: rows.length,
        lastImportedAt: new Date(),
      },
    })

    return { added, updated }
  }

  /**
   * Search across vendor and customer databases by name/company.
   * Returns matching rows with database context.
   */
  static async queryByName(
    organizationId: string,
    query: string,
    limit: number = 10
  ): Promise<Array<DatabaseRow & { databaseName: string; sourceType: string }>> {
    const databases = await prisma.database.findMany({
      where: {
        organizationId,
        sourceType: { in: ["system_vendors", "system_customers"] },
      },
      select: {
        name: true,
        sourceType: true,
        rows: true,
      },
    })

    const matches: Array<DatabaseRow & { databaseName: string; sourceType: string }> = []
    const queryLower = query.toLowerCase()

    for (const db of databases) {
      const rows = (db.rows as unknown as DatabaseRow[]) || []
      for (const row of rows) {
        const name = String(row.name || "").toLowerCase()
        const company = String(row.company || "").toLowerCase()
        if (
          name.includes(queryLower) ||
          company.includes(queryLower) ||
          queryLower.includes(name)
        ) {
          matches.push({
            ...row,
            databaseName: db.name,
            sourceType: db.sourceType || "",
          })
          if (matches.length >= limit) return matches
        }
      }
    }

    return matches
  }
}
