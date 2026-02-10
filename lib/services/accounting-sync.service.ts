/**
 * Accounting Sync Service
 *
 * Orchestrates data synchronization from accounting software (via Merge.dev)
 * into Vergo's Entity model (contacts) and Database feature (financial data).
 *
 * Sync strategy:
 * - Contacts: upsert into Entity by mergeRemoteId, dedup by email, skip contacts without email
 * - Data models: append-only snapshots into auto-created read-only Databases
 * - Each sync appends a new snapshot with an as_of_date; trimmed to MAX_SYNCED_ROWS (newest kept)
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { decrypt } from "@/lib/encryption"
import {
  MergeAccountingService,
  MergeContact,
  MergeInvoice,
  MergeAccount,
  MergeJournalEntry,
  MergePayment,
  MergeGeneralLedgerTransaction,
} from "./merge-accounting.service"
import {
  DatabaseSchema,
  DatabaseSchemaColumn,
  DatabaseRow,
} from "./database.service"

// ============================================
// Helper Functions
// ============================================

/**
 * Derive a "YYYY-MM" period string from a date string.
 */
function derivePeriod(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ""
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  } catch {
    return ""
  }
}

/**
 * Resolve an account ID to a display name via the lookup map.
 * Falls back to the raw accountId if not found.
 */
function resolveAccount(accountId: string | null | undefined, lookup: Map<string, string>): string {
  if (!accountId) return ""
  return lookup.get(accountId) || accountId
}

// ============================================
// Schema Definitions for Synced Databases
// ============================================

interface SyncedDatabaseDefinition {
  name: string
  description: string
  schema: DatabaseSchema
  sourceType: string
}

export const SYNCED_DATABASE_SCHEMAS: Record<string, SyncedDatabaseDefinition> = {
  accounts: {
    name: "Chart of Accounts",
    description: "Chart of accounts synced from accounting software",
    sourceType: "merge_accounts",
    schema: {
      columns: [
        { key: "as_of_date", label: "As Of", dataType: "date", required: true, order: 0 },
        { key: "remote_id", label: "ID", dataType: "text", required: true, order: 1 },
        { key: "account_number", label: "Account Number", dataType: "text", required: false, order: 2 },
        { key: "name", label: "Account Name", dataType: "text", required: true, order: 3 },
        { key: "classification", label: "Classification", dataType: "text", required: false, order: 4 },
        { key: "type", label: "Type", dataType: "text", required: false, order: 5 },
        { key: "status", label: "Status", dataType: "text", required: false, order: 6 },
        { key: "current_balance", label: "Current Balance", dataType: "currency", required: false, order: 7 },
        { key: "currency", label: "Currency", dataType: "text", required: false, order: 8 },
      ] as DatabaseSchemaColumn[],
      version: 2,
    },
  },

  invoices: {
    name: "Invoices",
    description: "AR and AP invoices synced from accounting software",
    sourceType: "merge_invoices",
    schema: {
      columns: [
        { key: "as_of_date", label: "As Of", dataType: "date", required: true, order: 0 },
        { key: "remote_id", label: "ID", dataType: "text", required: true, order: 1 },
        { key: "invoice_number", label: "Invoice #", dataType: "text", required: false, order: 2 },
        { key: "type", label: "Type", dataType: "text", required: false, order: 3 },
        { key: "contact_name", label: "Contact", dataType: "text", required: false, order: 4 },
        { key: "contact_email", label: "Contact Email", dataType: "text", required: false, order: 5 },
        { key: "issue_date", label: "Issue Date", dataType: "date", required: false, order: 6 },
        { key: "due_date", label: "Due Date", dataType: "date", required: false, order: 7 },
        { key: "total_amount", label: "Total Amount", dataType: "currency", required: false, order: 8 },
        { key: "balance", label: "Balance Due", dataType: "currency", required: false, order: 9 },
        { key: "paid_amount", label: "Paid Amount", dataType: "currency", required: false, order: 10 },
        { key: "status", label: "Status", dataType: "text", required: false, order: 11 },
        { key: "is_overdue", label: "Overdue", dataType: "boolean", required: false, order: 12 },
        { key: "days_overdue", label: "Days Overdue", dataType: "number", required: false, order: 13 },
        { key: "currency", label: "Currency", dataType: "text", required: false, order: 14 },
        { key: "paid_on_date", label: "Paid On", dataType: "date", required: false, order: 15 },
      ] as DatabaseSchemaColumn[],
      version: 2,
    },
  },

  journal_entries: {
    name: "Journal Entries",
    description: "Journal entries synced from accounting software (one row per line)",
    sourceType: "merge_journal_entries",
    schema: {
      columns: [
        { key: "as_of_date", label: "As Of", dataType: "date", required: true, order: 0 },
        { key: "remote_id", label: "Entry ID", dataType: "text", required: true, order: 1 },
        { key: "line_id", label: "Line ID", dataType: "text", required: false, order: 2 },
        { key: "transaction_date", label: "Date", dataType: "date", required: false, order: 3 },
        { key: "period", label: "Period", dataType: "text", required: false, order: 4 },
        { key: "journal_number", label: "Journal #", dataType: "text", required: false, order: 5 },
        { key: "memo", label: "Memo", dataType: "text", required: false, order: 6 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 7 },
        { key: "debit", label: "Debit", dataType: "currency", required: false, order: 8 },
        { key: "credit", label: "Credit", dataType: "currency", required: false, order: 9 },
        { key: "description", label: "Line Description", dataType: "text", required: false, order: 10 },
        { key: "contact", label: "Contact", dataType: "text", required: false, order: 11 },
      ] as DatabaseSchemaColumn[],
      version: 2,
    },
  },

  payments: {
    name: "Payments",
    description: "Payment records synced from accounting software",
    sourceType: "merge_payments",
    schema: {
      columns: [
        { key: "as_of_date", label: "As Of", dataType: "date", required: true, order: 0 },
        { key: "remote_id", label: "ID", dataType: "text", required: true, order: 1 },
        { key: "transaction_date", label: "Date", dataType: "date", required: false, order: 2 },
        { key: "contact_name", label: "Contact", dataType: "text", required: false, order: 3 },
        { key: "total_amount", label: "Amount", dataType: "currency", required: false, order: 4 },
        { key: "currency", label: "Currency", dataType: "text", required: false, order: 5 },
        { key: "reference", label: "Reference", dataType: "text", required: false, order: 6 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 7 },
      ] as DatabaseSchemaColumn[],
      version: 2,
    },
  },

  gl_transactions: {
    name: "General Ledger",
    description: "General ledger transactions synced from accounting software (one row per line)",
    sourceType: "merge_gl_transactions",
    schema: {
      columns: [
        { key: "as_of_date", label: "As Of", dataType: "date", required: true, order: 0 },
        { key: "remote_id", label: "Transaction ID", dataType: "text", required: true, order: 1 },
        { key: "line_id", label: "Line ID", dataType: "text", required: false, order: 2 },
        { key: "date", label: "Date", dataType: "date", required: false, order: 3 },
        { key: "period", label: "Period", dataType: "text", required: false, order: 4 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 5 },
        { key: "debit", label: "Debit", dataType: "currency", required: false, order: 6 },
        { key: "credit", label: "Credit", dataType: "currency", required: false, order: 7 },
        { key: "description", label: "Description", dataType: "text", required: false, order: 8 },
        { key: "transaction_type", label: "Transaction Type", dataType: "text", required: false, order: 9 },
        { key: "reference_id", label: "Reference ID", dataType: "text", required: false, order: 10 },
      ] as DatabaseSchemaColumn[],
      version: 2,
    },
  },

  invoice_line_items: {
    name: "Invoice Line Items",
    description: "Line items from invoices synced from accounting software",
    sourceType: "merge_invoice_line_items",
    schema: {
      columns: [
        { key: "as_of_date", label: "As Of", dataType: "date", required: true, order: 0 },
        { key: "invoice_remote_id", label: "Invoice ID", dataType: "text", required: true, order: 1 },
        { key: "invoice_number", label: "Invoice #", dataType: "text", required: false, order: 2 },
        { key: "description", label: "Description", dataType: "text", required: false, order: 3 },
        { key: "quantity", label: "Quantity", dataType: "number", required: false, order: 4 },
        { key: "unit_price", label: "Unit Price", dataType: "currency", required: false, order: 5 },
        { key: "total_amount", label: "Total", dataType: "currency", required: false, order: 6 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 7 },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },
}

type SyncModelKey = keyof typeof SYNCED_DATABASE_SCHEMAS

// ============================================
// Sync Result Types
// ============================================

export interface SyncResult {
  contactsSynced: number
  modelsProcessed: string[]
  errors: string[]
}

interface ModelSyncState {
  lastSyncAt: string | null
  status: "success" | "error" | "pending" | "skipped"
  error: string | null
  rowCount?: number
}

/**
 * Check if an error is a 403 scope/access error from Merge.
 * These are non-fatal — the model simply isn't available for this linked account.
 */
function isScopeError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes("403") || msg.includes("inaccessible") || msg.includes("enable the relevant Scopes")
}

interface SyncConfig {
  contacts?: boolean
  invoices?: boolean
  accounts?: boolean
  journalEntries?: boolean
  payments?: boolean
  glTransactions?: boolean
  invoiceLineItems?: boolean
  syncIntervalMinutes?: number
}

// Map from syncConfig keys to SYNCED_DATABASE_SCHEMAS keys
const CONFIG_TO_MODEL_MAP: Record<string, SyncModelKey> = {
  accounts: "accounts",
  invoices: "invoices",
  journalEntries: "journal_entries",
  payments: "payments",
  glTransactions: "gl_transactions",
  invoiceLineItems: "invoice_line_items",
}

// Max rows per synced database
const MAX_SYNCED_ROWS = 10000

// ============================================
// Service
// ============================================

export class AccountingSyncService {
  /**
   * Run a full sync for an organization.
   * Syncs contacts first, then each enabled data model.
   *
   * @param organizationId - The organization to sync
   * @param asOfDateParam - Optional ISO date string (YYYY-MM-DD) for the snapshot; defaults to today
   */
  static async syncAll(organizationId: string, asOfDateParam?: string): Promise<SyncResult> {
    const asOfDate = asOfDateParam || new Date().toISOString().split("T")[0]

    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId },
    })
    if (!integration || !integration.isActive) {
      throw new Error("No active accounting integration")
    }

    const accountToken = decrypt(integration.accountToken)
    const syncConfig = (integration.syncConfig || {}) as SyncConfig
    const syncState = (integration.syncState as unknown as Record<string, ModelSyncState>) || {} as Record<string, ModelSyncState>
    const errors: string[] = []
    const modelsProcessed: string[] = []
    let contactsSynced = 0

    // Mark as syncing
    await prisma.accountingIntegration.update({
      where: { id: integration.id },
      data: { syncStatus: "syncing" },
    })

    try {
      // Build lookups for account and contact name resolution
      const accounts = await MergeAccountingService.fetchAccounts(accountToken)
      const accountLookup = new Map<string, string>()
      for (const a of accounts) {
        const displayName = a.number ? `${a.number} - ${a.name || ""}` : (a.name || "")
        if (a.id) accountLookup.set(a.id, displayName)
        if (a.remote_id) accountLookup.set(a.remote_id, displayName)
      }

      const contacts = await MergeAccountingService.fetchContacts(accountToken)
      const contactLookup = new Map<string, string>()
      for (const c of contacts) {
        if (c.id && c.name) contactLookup.set(c.id, c.name)
        if (c.remote_id && c.name) contactLookup.set(c.remote_id, c.name)
      }

      // 1. Sync contacts first (needed for reference resolution)
      if (syncConfig.contacts !== false) {
        try {
          const lastSync = syncState.contacts?.lastSyncAt || undefined
          contactsSynced = await this.syncContacts(
            organizationId,
            accountToken,
            lastSync
          )
          syncState.contacts = {
            lastSyncAt: new Date().toISOString(),
            status: "success",
            error: null,
            rowCount: contactsSynced,
          }
          modelsProcessed.push("contacts")
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          errors.push(`contacts: ${msg}`)
          syncState.contacts = {
            ...syncState.contacts,
            lastSyncAt: syncState.contacts?.lastSyncAt || null,
            status: "error",
            error: msg,
          }
        }
      }

      // 2. Sync each data model into databases
      for (const [configKey, modelKey] of Object.entries(CONFIG_TO_MODEL_MAP)) {
        if ((syncConfig as Record<string, boolean | undefined>)[configKey] === false) continue

        try {
          const lastSync = syncState[modelKey]?.lastSyncAt || undefined
          const rowCount = await this.syncDataModel(
            organizationId,
            accountToken,
            modelKey,
            asOfDate,
            accountLookup,
            contactLookup,
            lastSync
          )
          syncState[modelKey] = {
            lastSyncAt: new Date().toISOString(),
            status: "success",
            error: null,
            rowCount,
          }
          modelsProcessed.push(modelKey)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          if (isScopeError(e)) {
            // 403 / scope errors are non-fatal — mark as skipped
            syncState[modelKey] = {
              ...syncState[modelKey],
              lastSyncAt: syncState[modelKey]?.lastSyncAt || null,
              status: "skipped",
              error: "Not available for this integration",
            }
            modelsProcessed.push(modelKey)
          } else {
            errors.push(`${modelKey}: ${msg}`)
            syncState[modelKey] = {
              ...syncState[modelKey],
              lastSyncAt: syncState[modelKey]?.lastSyncAt || null,
              status: "error",
              error: msg,
            }
          }
        }
      }

      // Update integration record
      await prisma.accountingIntegration.update({
        where: { id: integration.id },
        data: {
          syncState: syncState as unknown as Prisma.InputJsonValue,
          lastSyncAt: new Date(),
          lastSyncError: errors.length > 0 ? errors.join("; ") : null,
          syncStatus: errors.length > 0 ? "error" : "idle",
        },
      })

      return { contactsSynced, modelsProcessed, errors }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await prisma.accountingIntegration.update({
        where: { id: integration.id },
        data: { syncStatus: "error", lastSyncError: msg },
      })
      throw e
    }
  }

  // ============================================
  // Contact Sync
  // ============================================

  /**
   * Sync contacts from Merge into the Entity model.
   * Upserts by mergeRemoteId, deduplicates by email.
   * Skips contacts without an email address.
   */
  static async syncContacts(
    organizationId: string,
    accountToken: string,
    lastSyncAt?: string
  ): Promise<number> {
    const contacts = await MergeAccountingService.fetchContacts(
      accountToken,
      lastSyncAt
    )

    let synced = 0

    for (const contact of contacts) {
      if (contact.remote_was_deleted) continue

      const primaryEmail =
        contact.email_addresses?.find((e) => e.email_address)?.email_address ||
        null

      // Skip contacts without email
      if (!primaryEmail) continue

      const primaryPhone =
        contact.phone_numbers?.find((p) => p.number)?.number || null

      // Determine contact type
      let contactType: "VENDOR" | "CLIENT" | "UNKNOWN" = "UNKNOWN"
      if (contact.is_supplier) contactType = "VENDOR"
      else if (contact.is_customer) contactType = "CLIENT"

      // Smart name mapping
      // Vendors/suppliers from accounting software are companies, not people.
      // Put the full name into companyName and firstName (for display).
      let firstName: string
      let lastName: string | undefined
      let companyName: string | undefined
      const fullName = contact.name || "Unknown"

      if (contact.is_supplier || (contact.company && fullName === contact.company)) {
        // Vendor/supplier: the "name" is a company name
        firstName = fullName
        lastName = undefined
        companyName = contact.company || fullName
      } else {
        // Customer or unknown: split into first/last name
        const nameParts = fullName.split(" ")
        firstName = nameParts[0] || "Unknown"
        lastName = nameParts.slice(1).join(" ") || undefined
        companyName = contact.company || undefined
      }

      // Extract primary address
      const addr = contact.addresses?.[0]
      const addressStreet1 = addr?.street_1 || ""
      const addressStreet2 = addr?.street_2 || ""
      const addressCity = addr?.city || ""
      const addressState = addr?.state || ""
      const addressPostalCode = addr?.postal_code || ""
      const addressCountry = addr?.country || ""

      // Try to find existing entity by mergeRemoteId
      const existing = await prisma.entity.findFirst({
        where: { organizationId, mergeRemoteId: contact.id },
      })

      if (existing) {
        // Update existing synced contact
        await prisma.entity.update({
          where: { id: existing.id },
          data: {
            firstName,
            lastName,
            email: primaryEmail || existing.email,
            phone: primaryPhone || existing.phone,
            companyName: companyName || existing.companyName,
            contactType,
            addressStreet1,
            addressStreet2,
            addressCity,
            addressState,
            addressPostalCode,
            addressCountry,
          },
        })
        synced++
        continue
      }

      // No mergeRemoteId match - check for email match to link existing entity
      if (primaryEmail) {
        const emailMatch = await prisma.entity.findFirst({
          where: { organizationId, email: primaryEmail },
        })
        if (emailMatch) {
          await prisma.entity.update({
            where: { id: emailMatch.id },
            data: {
              mergeRemoteId: contact.id,
              companyName: companyName || emailMatch.companyName,
              contactType:
                contactType !== "UNKNOWN"
                  ? contactType
                  : emailMatch.contactType,
              addressStreet1,
              addressStreet2,
              addressCity,
              addressState,
              addressPostalCode,
              addressCountry,
            },
          })
          synced++
          continue
        }
      }

      // Create new entity
      await prisma.entity.create({
        data: {
          firstName,
          lastName,
          email: primaryEmail,
          phone: primaryPhone,
          companyName,
          contactType,
          isInternal: false,
          organizationId,
          mergeRemoteId: contact.id,
          addressStreet1,
          addressStreet2,
          addressCity,
          addressState,
          addressPostalCode,
          addressCountry,
        },
      })
      synced++
    }

    return synced
  }

  // ============================================
  // Data Model Sync
  // ============================================

  /**
   * Sync a data model from Merge into a Database.
   * Auto-creates the database if it doesn't exist.
   * Uses append strategy: new snapshot rows are appended to existing rows.
   * Migrates schema version if the definition has been updated.
   */
  static async syncDataModel(
    organizationId: string,
    accountToken: string,
    modelKey: SyncModelKey,
    asOfDate: string,
    accountLookup: Map<string, string>,
    contactLookup: Map<string, string>,
    lastSyncAt?: string
  ): Promise<number> {
    const definition = SYNCED_DATABASE_SCHEMAS[modelKey]
    if (!definition) throw new Error(`Unknown model key: ${modelKey}`)

    // Find or create the target database
    let database = await prisma.database.findFirst({
      where: { organizationId, sourceType: definition.sourceType },
    })

    // Get an admin user for tracking
    const adminUser = await prisma.user.findFirst({
      where: { organizationId, role: "ADMIN" },
      select: { id: true },
    })
    if (!adminUser) throw new Error("No admin user found for organization")

    if (!database) {
      database = await prisma.database.create({
        data: {
          name: definition.name,
          description: definition.description,
          organizationId,
          schema: definition.schema as unknown as Prisma.InputJsonValue,
          identifierKeys: ["remote_id"],
          rows: [],
          rowCount: 0,
          sourceType: definition.sourceType,
          isReadOnly: true,
          createdById: adminUser.id,
        },
      })
    } else {
      // Schema version migration: update schema if definition version is newer
      const existingSchema = database.schema as unknown as DatabaseSchema
      if (existingSchema && existingSchema.version < definition.schema.version) {
        await prisma.database.update({
          where: { id: database.id },
          data: {
            schema: definition.schema as unknown as Prisma.InputJsonValue,
          },
        })
      }
    }

    // Fetch and transform data from Merge
    const newRows = await this.fetchAndTransform(
      modelKey,
      accountToken,
      asOfDate,
      accountLookup,
      contactLookup,
      lastSyncAt,
      organizationId
    )

    if (newRows.length === 0) {
      return (database.rows as unknown as DatabaseRow[])?.length || 0
    }

    // Append strategy: add new snapshot rows to existing rows
    const existingRows = (database.rows as unknown as DatabaseRow[]) || []
    const finalRows = [...existingRows, ...newRows]

    // Enforce row limit - keep newest rows (slice from end)
    const trimmedRows =
      finalRows.length > MAX_SYNCED_ROWS
        ? finalRows.slice(finalRows.length - MAX_SYNCED_ROWS)
        : finalRows

    await prisma.database.update({
      where: { id: database.id },
      data: {
        rows: trimmedRows as unknown as Prisma.InputJsonValue,
        rowCount: trimmedRows.length,
        lastImportedAt: new Date(),
        lastImportedById: adminUser.id,
      },
    })

    return trimmedRows.length
  }

  // ============================================
  // Data Transformation
  // ============================================

  /**
   * Fetch data from Merge and transform to DatabaseRow format.
   * Passes asOfDate, accountLookup, and contactLookup to each transform function.
   */
  private static async fetchAndTransform(
    modelKey: SyncModelKey,
    accountToken: string,
    asOfDate: string,
    accountLookup: Map<string, string>,
    contactLookup: Map<string, string>,
    lastSyncAt?: string,
    organizationId?: string
  ): Promise<DatabaseRow[]> {
    switch (modelKey) {
      case "accounts":
        return this.transformAccounts(
          await MergeAccountingService.fetchAccounts(accountToken, lastSyncAt),
          asOfDate,
          accountLookup,
          contactLookup
        )

      case "invoices":
        return this.transformInvoices(
          await MergeAccountingService.fetchInvoices(accountToken, lastSyncAt),
          asOfDate,
          accountLookup,
          contactLookup
        )

      case "journal_entries":
        return this.transformJournalEntries(
          await MergeAccountingService.fetchJournalEntries(
            accountToken,
            lastSyncAt
          ),
          asOfDate,
          accountLookup,
          contactLookup
        )

      case "payments":
        return this.transformPayments(
          await MergeAccountingService.fetchPayments(accountToken, lastSyncAt),
          asOfDate,
          accountLookup,
          contactLookup
        )

      case "gl_transactions":
        return this.transformGLTransactions(
          await MergeAccountingService.fetchGeneralLedgerTransactions(
            accountToken,
            lastSyncAt
          ),
          asOfDate,
          accountLookup,
          contactLookup
        )

      case "invoice_line_items":
        return this.transformInvoiceLineItems(
          await MergeAccountingService.fetchInvoices(accountToken, lastSyncAt),
          asOfDate,
          accountLookup,
          contactLookup
        )

      default:
        return []
    }
  }

  // --- Accounts ---
  private static transformAccounts(
    accounts: MergeAccount[],
    asOfDate: string,
    accountLookup?: Map<string, string>,
    contactLookup?: Map<string, string>
  ): DatabaseRow[] {
    return accounts
      .filter((a) => !a.remote_was_deleted)
      .map((a) => ({
        as_of_date: asOfDate,
        remote_id: a.remote_id || a.id,
        account_number: a.number || "",
        name: a.name || "",
        classification: a.classification
          ? a.classification.charAt(0) + a.classification.slice(1).toLowerCase()
          : "",
        type: a.type || "",
        status: a.status
          ? a.status.charAt(0) + a.status.slice(1).toLowerCase()
          : "Active",
        current_balance: a.current_balance ?? 0,
        currency: a.currency || "",
      }))
  }

  // --- Invoices ---
  private static transformInvoices(
    invoices: MergeInvoice[],
    asOfDate: string,
    accountLookup?: Map<string, string>,
    contactLookup?: Map<string, string>
  ): DatabaseRow[] {
    const now = new Date()
    const rows = invoices
      .filter((inv) => !inv.remote_was_deleted)
      .map((inv) => {
        const totalAmount = inv.total_amount ?? 0
        const balance = inv.balance ?? 0
        const paidAmount = totalAmount - balance
        const dueDate = inv.due_date ? new Date(inv.due_date) : null
        const isOverdue = dueDate ? dueDate < now && balance > 0 : false
        const daysOverdue =
          isOverdue && dueDate
            ? Math.floor(
                (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
              )
            : 0

        // Resolve contact name from expanded contact object
        let contactName = ""
        let contactEmail = ""
        if (inv.contact && typeof inv.contact === "object") {
          const c = inv.contact as MergeContact
          contactName = c.name || ""
          contactEmail =
            c.email_addresses?.find((e) => e.email_address)?.email_address || ""
        }

        return {
          as_of_date: asOfDate,
          remote_id: inv.remote_id || inv.id,
          invoice_number: inv.number || "",
          type: inv.type || "",
          contact_name: contactName,
          contact_email: contactEmail,
          issue_date: inv.issue_date || "",
          due_date: inv.due_date || "",
          total_amount: totalAmount,
          balance,
          paid_amount: paidAmount,
          status: inv.status || "",
          is_overdue: isOverdue,
          days_overdue: daysOverdue,
          currency: inv.currency || "",
          paid_on_date: inv.paid_on_date || "",
        }
      })

    // Sort overdue-first, then by days_overdue descending
    rows.sort((a, b) => {
      if (a.is_overdue && !b.is_overdue) return -1
      if (!a.is_overdue && b.is_overdue) return 1
      return (b.days_overdue as number) - (a.days_overdue as number)
    })

    return rows
  }

  // --- Journal Entries (one row per line) ---
  private static transformJournalEntries(
    entries: MergeJournalEntry[],
    asOfDate: string,
    accountLookup?: Map<string, string>,
    contactLookup?: Map<string, string>
  ): DatabaseRow[] {
    const rows: DatabaseRow[] = []
    for (const entry of entries) {
      if (entry.remote_was_deleted) continue

      if (entry.lines && entry.lines.length > 0) {
        for (const line of entry.lines) {
          const netAmount = line.net_amount ?? 0
          rows.push({
            as_of_date: asOfDate,
            remote_id: entry.remote_id || entry.id,
            line_id: line.remote_id || line.id,
            transaction_date: entry.transaction_date || "",
            period: derivePeriod(entry.transaction_date),
            journal_number: entry.journal_number || "",
            memo: entry.memo || "",
            account: resolveAccount(line.account, accountLookup || new Map()),
            debit: netAmount > 0 ? netAmount : 0,
            credit: netAmount < 0 ? Math.abs(netAmount) : 0,
            description: line.description || "",
            contact: contactLookup?.get(line.contact || "") || line.contact || "",
          })
        }
      } else {
        // Entry without lines
        rows.push({
          as_of_date: asOfDate,
          remote_id: entry.remote_id || entry.id,
          line_id: "",
          transaction_date: entry.transaction_date || "",
          period: derivePeriod(entry.transaction_date),
          journal_number: entry.journal_number || "",
          memo: entry.memo || "",
          account: "",
          debit: 0,
          credit: 0,
          description: "",
          contact: "",
        })
      }
    }

    // Sort by date descending
    rows.sort((a, b) => {
      const dateA = a.transaction_date as string
      const dateB = b.transaction_date as string
      return dateB.localeCompare(dateA)
    })

    return rows
  }

  // --- Payments ---
  private static transformPayments(
    payments: MergePayment[],
    asOfDate: string,
    accountLookup?: Map<string, string>,
    contactLookup?: Map<string, string>
  ): DatabaseRow[] {
    return payments
      .filter((p) => !p.remote_was_deleted)
      .map((p) => {
        let contactName = ""
        if (p.contact && typeof p.contact === "object") {
          contactName = (p.contact as MergeContact).name || ""
        }

        return {
          as_of_date: asOfDate,
          remote_id: p.remote_id || p.id,
          transaction_date: p.transaction_date || "",
          contact_name: contactName,
          total_amount: p.total_amount ?? 0,
          currency: p.currency || "",
          reference: p.reference || "",
          account: resolveAccount(
            typeof p.account === "string" ? p.account : "",
            accountLookup || new Map()
          ),
        }
      })
  }

  // --- General Ledger Transactions (one row per line) ---
  private static transformGLTransactions(
    transactions: MergeGeneralLedgerTransaction[],
    asOfDate: string,
    accountLookup?: Map<string, string>,
    contactLookup?: Map<string, string>
  ): DatabaseRow[] {
    const rows: DatabaseRow[] = []
    for (const txn of transactions) {
      if (txn.remote_was_deleted) continue

      if (txn.lines && txn.lines.length > 0) {
        for (const line of txn.lines) {
          const netAmount = line.net_amount ?? 0
          rows.push({
            as_of_date: asOfDate,
            remote_id: txn.remote_id || txn.id,
            line_id: line.remote_id || "",
            date: txn.remote_created_at || "",
            period: derivePeriod(txn.remote_created_at),
            account: resolveAccount(line.account, accountLookup || new Map()),
            debit: netAmount > 0 ? netAmount : 0,
            credit: netAmount < 0 ? Math.abs(netAmount) : 0,
            description: line.description || "",
            transaction_type: txn.underlying_transaction_type || "",
            reference_id: txn.underlying_transaction_remote_id || "",
          })
        }
      } else {
        rows.push({
          as_of_date: asOfDate,
          remote_id: txn.remote_id || txn.id,
          line_id: "",
          date: txn.remote_created_at || "",
          period: derivePeriod(txn.remote_created_at),
          account: "",
          debit: 0,
          credit: 0,
          description: "",
          transaction_type: txn.underlying_transaction_type || "",
          reference_id: txn.underlying_transaction_remote_id || "",
        })
      }
    }

    // Sort by date descending
    rows.sort((a, b) => {
      const dateA = a.date as string
      const dateB = b.date as string
      return dateB.localeCompare(dateA)
    })

    return rows
  }

  // --- Invoice Line Items (flattened from invoices) ---
  private static transformInvoiceLineItems(
    invoices: MergeInvoice[],
    asOfDate: string,
    accountLookup?: Map<string, string>,
    contactLookup?: Map<string, string>
  ): DatabaseRow[] {
    const rows: DatabaseRow[] = []
    for (const inv of invoices) {
      if (inv.remote_was_deleted) continue
      if (!inv.line_items || inv.line_items.length === 0) continue

      for (const item of inv.line_items) {
        rows.push({
          as_of_date: asOfDate,
          invoice_remote_id: inv.remote_id || inv.id,
          invoice_number: inv.number || "",
          description: item.description || "",
          quantity: item.quantity ?? 0,
          unit_price: item.unit_price ?? 0,
          total_amount: item.total_amount ?? 0,
          account: resolveAccount(item.account, accountLookup || new Map()),
        })
      }
    }
    return rows
  }

  /**
   * Map a sourceType (e.g., "merge_invoices") back to a SyncModelKey.
   */
  private static sourceTypeToModelKey(sourceType: string): SyncModelKey | null {
    for (const [key, def] of Object.entries(SYNCED_DATABASE_SCHEMAS)) {
      if (def.sourceType === sourceType) return key as SyncModelKey
    }
    return null
  }

  /**
   * Apply simple column-value equality filters to rows.
   * Filters are AND logic — all must match.
   * Supports case-insensitive string comparison.
   */
  static applyFilters(
    rows: DatabaseRow[],
    filters: Array<{ column: string; value: string }>
  ): DatabaseRow[] {
    if (!filters || filters.length === 0) return rows
    return rows.filter((row) =>
      filters.every((f) => {
        const cellValue = row[f.column]
        if (cellValue === undefined || cellValue === null) return false
        return String(cellValue).toLowerCase() === f.value.toLowerCase()
      })
    )
  }

  /**
   * Sync a single database from its accounting source.
   * Used by the per-database sync API (POST /api/databases/[id]/sync).
   *
   * @param databaseId - The database to sync
   * @param asOfDate - ISO date string (YYYY-MM-DD) for the snapshot
   */
  static async syncSingleDatabase(
    databaseId: string,
    asOfDate: string
  ): Promise<{ rowCount: number }> {
    const database = await prisma.database.findUnique({
      where: { id: databaseId },
    })
    if (!database) throw new Error("Database not found")
    if (!database.sourceType) throw new Error("Database has no accounting source")

    const modelKey = this.sourceTypeToModelKey(database.sourceType)
    if (!modelKey) throw new Error(`Unknown source type: ${database.sourceType}`)

    // Get account token
    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: database.organizationId },
    })
    if (!integration || !integration.isActive) {
      throw new Error("No active accounting integration")
    }
    const accountToken = decrypt(integration.accountToken)

    // Mark as syncing
    await prisma.database.update({
      where: { id: databaseId },
      data: { syncStatus: "syncing", lastSyncError: null },
    })

    try {
      // Build lookups
      const accounts = await MergeAccountingService.fetchAccounts(accountToken)
      const accountLookup = new Map<string, string>()
      for (const a of accounts) {
        const displayName = a.number ? `${a.number} - ${a.name || ""}` : (a.name || "")
        if (a.id) accountLookup.set(a.id, displayName)
        if (a.remote_id) accountLookup.set(a.remote_id, displayName)
      }

      const contacts = await MergeAccountingService.fetchContacts(accountToken)
      const contactLookup = new Map<string, string>()
      for (const c of contacts) {
        if (c.id && c.name) contactLookup.set(c.id, c.name)
        if (c.remote_id && c.name) contactLookup.set(c.remote_id, c.name)
      }

      // Fetch and transform
      let newRows = await this.fetchAndTransform(
        modelKey,
        accountToken,
        asOfDate,
        accountLookup,
        contactLookup,
        undefined, // no lastSyncAt filter — always fetch all
        database.organizationId
      )

      // Apply user-defined filters
      const syncFilter = (database.syncFilter as Array<{ column: string; value: string }>) || []
      newRows = this.applyFilters(newRows, syncFilter)

      // Append to existing rows
      const existingRows = (database.rows as unknown as DatabaseRow[]) || []
      const finalRows = [...existingRows, ...newRows]
      const trimmedRows =
        finalRows.length > MAX_SYNCED_ROWS
          ? finalRows.slice(finalRows.length - MAX_SYNCED_ROWS)
          : finalRows

      await prisma.database.update({
        where: { id: databaseId },
        data: {
          rows: trimmedRows as unknown as Prisma.InputJsonValue,
          rowCount: trimmedRows.length,
          lastImportedAt: new Date(),
          lastSyncAsOfDate: asOfDate,
          syncStatus: "success",
          lastSyncError: null,
        },
      })

      return { rowCount: trimmedRows.length }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      await prisma.database.update({
        where: { id: databaseId },
        data: { syncStatus: "error", lastSyncError: msg },
      })
      throw error
    }
  }
}
