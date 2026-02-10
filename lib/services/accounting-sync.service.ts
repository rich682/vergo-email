/**
 * Accounting Sync Service
 *
 * Orchestrates data synchronization from accounting software (via Merge.dev)
 * into Vergo's Entity model (contacts) and Database feature (financial data).
 *
 * Sync strategy:
 * - Contacts: upsert into Entity by mergeRemoteId, dedup by email
 * - Data models: replace-by-remote-id into auto-created read-only Databases
 * - Incremental sync via Merge's modified_after parameter
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
// Schema Definitions for Synced Databases
// ============================================

interface SyncedDatabaseDefinition {
  name: string
  description: string
  schema: DatabaseSchema
  sourceType: string
}

const SYNCED_DATABASE_SCHEMAS: Record<string, SyncedDatabaseDefinition> = {
  accounts: {
    name: "Chart of Accounts",
    description: "Chart of accounts synced from accounting software",
    sourceType: "merge_accounts",
    schema: {
      columns: [
        { key: "remote_id", label: "ID", dataType: "text", required: true, order: 0 },
        { key: "account_number", label: "Account Number", dataType: "text", required: false, order: 1 },
        { key: "name", label: "Account Name", dataType: "text", required: true, order: 2 },
        { key: "classification", label: "Classification", dataType: "text", required: false, order: 3 },
        { key: "type", label: "Type", dataType: "text", required: false, order: 4 },
        { key: "status", label: "Status", dataType: "text", required: false, order: 5 },
        { key: "current_balance", label: "Current Balance", dataType: "currency", required: false, order: 6 },
        { key: "currency", label: "Currency", dataType: "text", required: false, order: 7 },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },

  invoices: {
    name: "Invoices",
    description: "AR and AP invoices synced from accounting software",
    sourceType: "merge_invoices",
    schema: {
      columns: [
        { key: "remote_id", label: "ID", dataType: "text", required: true, order: 0 },
        { key: "invoice_number", label: "Invoice #", dataType: "text", required: false, order: 1 },
        { key: "type", label: "Type", dataType: "text", required: false, order: 2 },
        { key: "contact_name", label: "Contact", dataType: "text", required: false, order: 3 },
        { key: "contact_email", label: "Contact Email", dataType: "text", required: false, order: 4 },
        { key: "issue_date", label: "Issue Date", dataType: "date", required: false, order: 5 },
        { key: "due_date", label: "Due Date", dataType: "date", required: false, order: 6 },
        { key: "total_amount", label: "Total Amount", dataType: "currency", required: false, order: 7 },
        { key: "balance", label: "Balance Due", dataType: "currency", required: false, order: 8 },
        { key: "paid_amount", label: "Paid Amount", dataType: "currency", required: false, order: 9 },
        { key: "status", label: "Status", dataType: "text", required: false, order: 10 },
        { key: "is_overdue", label: "Overdue", dataType: "boolean", required: false, order: 11 },
        { key: "days_overdue", label: "Days Overdue", dataType: "number", required: false, order: 12 },
        { key: "currency", label: "Currency", dataType: "text", required: false, order: 13 },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },

  journal_entries: {
    name: "Journal Entries",
    description: "Journal entries synced from accounting software (one row per line)",
    sourceType: "merge_journal_entries",
    schema: {
      columns: [
        { key: "remote_id", label: "Entry ID", dataType: "text", required: true, order: 0 },
        { key: "line_id", label: "Line ID", dataType: "text", required: false, order: 1 },
        { key: "transaction_date", label: "Date", dataType: "date", required: false, order: 2 },
        { key: "journal_number", label: "Journal #", dataType: "text", required: false, order: 3 },
        { key: "memo", label: "Memo", dataType: "text", required: false, order: 4 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 5 },
        { key: "debit", label: "Debit", dataType: "currency", required: false, order: 6 },
        { key: "credit", label: "Credit", dataType: "currency", required: false, order: 7 },
        { key: "description", label: "Line Description", dataType: "text", required: false, order: 8 },
        { key: "contact", label: "Contact", dataType: "text", required: false, order: 9 },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },

  payments: {
    name: "Payments",
    description: "Payment records synced from accounting software",
    sourceType: "merge_payments",
    schema: {
      columns: [
        { key: "remote_id", label: "ID", dataType: "text", required: true, order: 0 },
        { key: "transaction_date", label: "Date", dataType: "date", required: false, order: 1 },
        { key: "contact_name", label: "Contact", dataType: "text", required: false, order: 2 },
        { key: "total_amount", label: "Amount", dataType: "currency", required: false, order: 3 },
        { key: "currency", label: "Currency", dataType: "text", required: false, order: 4 },
        { key: "reference", label: "Reference", dataType: "text", required: false, order: 5 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 6 },
      ] as DatabaseSchemaColumn[],
      version: 1,
    },
  },

  gl_transactions: {
    name: "General Ledger",
    description: "General ledger transactions synced from accounting software (one row per line)",
    sourceType: "merge_gl_transactions",
    schema: {
      columns: [
        { key: "remote_id", label: "Transaction ID", dataType: "text", required: true, order: 0 },
        { key: "line_id", label: "Line ID", dataType: "text", required: false, order: 1 },
        { key: "date", label: "Date", dataType: "date", required: false, order: 2 },
        { key: "account", label: "Account", dataType: "text", required: false, order: 3 },
        { key: "debit", label: "Debit", dataType: "currency", required: false, order: 4 },
        { key: "credit", label: "Credit", dataType: "currency", required: false, order: 5 },
        { key: "description", label: "Description", dataType: "text", required: false, order: 6 },
        { key: "transaction_type", label: "Transaction Type", dataType: "text", required: false, order: 7 },
        { key: "reference_id", label: "Reference ID", dataType: "text", required: false, order: 8 },
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
  syncIntervalMinutes?: number
}

// Map from syncConfig keys to SYNCED_DATABASE_SCHEMAS keys
const CONFIG_TO_MODEL_MAP: Record<string, SyncModelKey> = {
  accounts: "accounts",
  invoices: "invoices",
  journalEntries: "journal_entries",
  payments: "payments",
  glTransactions: "gl_transactions",
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
   */
  static async syncAll(organizationId: string): Promise<SyncResult> {
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
      const primaryPhone =
        contact.phone_numbers?.find((p) => p.number)?.number || null

      const nameParts = (contact.name || "Unknown").split(" ")
      const firstName = nameParts[0] || "Unknown"
      const lastName = nameParts.slice(1).join(" ") || undefined

      // Determine contact type
      let contactType: "VENDOR" | "CLIENT" | "UNKNOWN" = "UNKNOWN"
      if (contact.is_supplier) contactType = "VENDOR"
      else if (contact.is_customer) contactType = "CLIENT"

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
            companyName: contact.company || existing.companyName,
            contactType,
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
              companyName: contact.company || emailMatch.companyName,
              contactType:
                contactType !== "UNKNOWN"
                  ? contactType
                  : emailMatch.contactType,
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
          companyName: contact.company,
          contactType,
          isInternal: false,
          organizationId,
          mergeRemoteId: contact.id,
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
   * Uses replace-by-remote-id strategy for incremental updates.
   */
  static async syncDataModel(
    organizationId: string,
    accountToken: string,
    modelKey: SyncModelKey,
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
    }

    // Fetch and transform data from Merge
    const newRows = await this.fetchAndTransform(
      modelKey,
      accountToken,
      lastSyncAt,
      organizationId
    )

    if (newRows.length === 0) {
      return (database.rows as unknown as DatabaseRow[])?.length || 0
    }

    // Replace-by-remote-id: remove old versions of synced rows, add new ones
    const existingRows = (database.rows as unknown as DatabaseRow[]) || []
    const newRemoteIds = new Set(newRows.map((r) => String(r.remote_id)))
    const keptRows = existingRows.filter(
      (r) => !newRemoteIds.has(String(r.remote_id))
    )
    const finalRows = [...keptRows, ...newRows]

    // Enforce row limit - keep most recent
    const trimmedRows =
      finalRows.length > MAX_SYNCED_ROWS
        ? finalRows.slice(-MAX_SYNCED_ROWS)
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
   * Fetch data from Merge and transform to DatabaseRow format
   */
  private static async fetchAndTransform(
    modelKey: SyncModelKey,
    accountToken: string,
    lastSyncAt?: string,
    organizationId?: string
  ): Promise<DatabaseRow[]> {
    switch (modelKey) {
      case "accounts":
        return this.transformAccounts(
          await MergeAccountingService.fetchAccounts(accountToken, lastSyncAt)
        )

      case "invoices":
        return this.transformInvoices(
          await MergeAccountingService.fetchInvoices(accountToken, lastSyncAt)
        )

      case "journal_entries":
        return this.transformJournalEntries(
          await MergeAccountingService.fetchJournalEntries(
            accountToken,
            lastSyncAt
          )
        )

      case "payments":
        return this.transformPayments(
          await MergeAccountingService.fetchPayments(accountToken, lastSyncAt)
        )

      case "gl_transactions":
        return this.transformGLTransactions(
          await MergeAccountingService.fetchGeneralLedgerTransactions(
            accountToken,
            lastSyncAt
          )
        )

      default:
        return []
    }
  }

  // --- Accounts ---
  private static transformAccounts(accounts: MergeAccount[]): DatabaseRow[] {
    return accounts
      .filter((a) => !a.remote_was_deleted)
      .map((a) => ({
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
  private static transformInvoices(invoices: MergeInvoice[]): DatabaseRow[] {
    const now = new Date()
    return invoices
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
        }
      })
  }

  // --- Journal Entries (one row per line) ---
  private static transformJournalEntries(
    entries: MergeJournalEntry[]
  ): DatabaseRow[] {
    const rows: DatabaseRow[] = []
    for (const entry of entries) {
      if (entry.remote_was_deleted) continue

      if (entry.lines && entry.lines.length > 0) {
        for (const line of entry.lines) {
          const netAmount = line.net_amount ?? 0
          rows.push({
            remote_id: entry.remote_id || entry.id,
            line_id: line.remote_id || line.id,
            transaction_date: entry.transaction_date || "",
            journal_number: entry.journal_number || "",
            memo: entry.memo || "",
            account: line.account || "",
            debit: netAmount > 0 ? netAmount : 0,
            credit: netAmount < 0 ? Math.abs(netAmount) : 0,
            description: line.description || "",
            contact: line.contact || "",
          })
        }
      } else {
        // Entry without lines
        rows.push({
          remote_id: entry.remote_id || entry.id,
          line_id: "",
          transaction_date: entry.transaction_date || "",
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
    return rows
  }

  // --- Payments ---
  private static transformPayments(payments: MergePayment[]): DatabaseRow[] {
    return payments
      .filter((p) => !p.remote_was_deleted)
      .map((p) => {
        let contactName = ""
        if (p.contact && typeof p.contact === "object") {
          contactName = (p.contact as MergeContact).name || ""
        }

        return {
          remote_id: p.remote_id || p.id,
          transaction_date: p.transaction_date || "",
          contact_name: contactName,
          total_amount: p.total_amount ?? 0,
          currency: p.currency || "",
          reference: p.reference || "",
          account: typeof p.account === "string" ? p.account : "",
        }
      })
  }

  // --- General Ledger Transactions (one row per line) ---
  private static transformGLTransactions(
    transactions: MergeGeneralLedgerTransaction[]
  ): DatabaseRow[] {
    const rows: DatabaseRow[] = []
    for (const txn of transactions) {
      if (txn.remote_was_deleted) continue

      if (txn.lines && txn.lines.length > 0) {
        for (const line of txn.lines) {
          const netAmount = line.net_amount ?? 0
          rows.push({
            remote_id: txn.remote_id || txn.id,
            line_id: line.remote_id || "",
            date: txn.remote_created_at || "",
            account: line.account || "",
            debit: netAmount > 0 ? netAmount : 0,
            credit: netAmount < 0 ? Math.abs(netAmount) : 0,
            description: line.description || "",
            transaction_type: txn.underlying_transaction_type || "",
            reference_id: txn.underlying_transaction_remote_id || "",
          })
        }
      } else {
        rows.push({
          remote_id: txn.remote_id || txn.id,
          line_id: "",
          date: txn.remote_created_at || "",
          account: "",
          debit: 0,
          credit: 0,
          description: "",
          transaction_type: txn.underlying_transaction_type || "",
          reference_id: txn.underlying_transaction_remote_id || "",
        })
      }
    }
    return rows
  }
}
