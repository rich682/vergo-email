/**
 * Merge.dev Accounting API Service
 *
 * Wraps all Merge.dev Unified Accounting API calls.
 * Handles authentication, pagination, and data fetching for:
 * - Contacts, Invoices, Accounts (Chart of Accounts)
 * - Journal Entries, Payments, General Ledger Transactions
 *
 * Auth model:
 * - Authorization: Bearer <MERGE_API_KEY> (identifies your app)
 * - X-Account-Token: <account_token> (identifies end user's linked account)
 */

import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

const MERGE_BASE_URL = "https://api.merge.dev/api/accounting/v1"
const MERGE_INTEGRATIONS_URL = "https://api.merge.dev/api/integrations"

// ============================================
// Types - Merge API response shapes
// ============================================

interface MergePaginatedResponse<T> {
  next: string | null
  previous: string | null
  results: T[]
}

export interface MergeContact {
  id: string
  remote_id: string | null
  name: string | null
  is_supplier: boolean | null
  is_customer: boolean | null
  email_addresses: Array<{
    email_address: string | null
    email_address_type: string | null
  }>
  phone_numbers: Array<{
    number: string | null
    phone_number_type: string | null
  }>
  company: string | null
  addresses: Array<{
    street_1: string | null
    street_2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    country: string | null
    type: string | null
  }>
  remote_was_deleted: boolean
  modified_at: string | null
}

export interface MergeInvoice {
  id: string
  remote_id: string | null
  type: "ACCOUNTS_RECEIVABLE" | "ACCOUNTS_PAYABLE" | null
  contact: string | MergeContact | null
  number: string | null
  issue_date: string | null
  due_date: string | null
  paid_on_date: string | null
  total_amount: number | null
  balance: number | null
  currency: string | null
  status: string | null
  line_items: Array<{
    id: string
    description: string | null
    unit_price: number | null
    quantity: number | null
    total_amount: number | null
    account: string | null
    item: string | null
    tracking_categories: string[]
  }>
  remote_was_deleted: boolean
  modified_at: string | null
}

export interface MergeAccount {
  id: string
  remote_id: string | null
  name: string | null
  number: string | null
  classification: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | null
  type: string | null
  status: "ACTIVE" | "ARCHIVED" | null
  current_balance: number | null
  currency: string | null
  company: string | null
  remote_was_deleted: boolean
  modified_at: string | null
}

export interface MergeJournalEntryLine {
  id: string
  remote_id: string | null
  account: string | null
  net_amount: number | null
  tracking_category: string | null
  tracking_categories: string[]
  contact: string | null
  description: string | null
}

export interface MergeJournalEntry {
  id: string
  remote_id: string | null
  transaction_date: string | null
  journal_number: string | null
  memo: string | null
  currency: string | null
  lines: MergeJournalEntryLine[]
  remote_was_deleted: boolean
  modified_at: string | null
}

export interface MergePayment {
  id: string
  remote_id: string | null
  transaction_date: string | null
  contact: string | MergeContact | null
  account: string | null
  total_amount: number | null
  currency: string | null
  reference: string | null
  remote_was_deleted: boolean
  modified_at: string | null
}

export interface MergeGeneralLedgerTransaction {
  id: string
  remote_id: string | null
  remote_created_at: string | null
  underlying_transaction_type: string | null
  underlying_transaction_remote_id: string | null
  lines: Array<{
    remote_id: string | null
    account: string | null
    net_amount: number | null
    description: string | null
    tracking_categories: string[]
  }>
  remote_was_deleted: boolean
  modified_at: string | null
}

export interface MergeLinkTokenResponse {
  link_token: string
  integration_name?: string
}

export interface MergeAccountTokenResponse {
  account_token: string
  integration: {
    name: string
    slug: string
    category: string
  }
}

// ============================================
// Service
// ============================================

export class MergeAccountingService {
  /**
   * Get the Merge API key from environment
   */
  private static getApiKey(): string {
    const key = process.env.MERGE_API_KEY
    if (!key) throw new Error("MERGE_API_KEY environment variable is not configured")
    return key
  }

  /**
   * Get the decrypted account token for an organization
   */
  static async getAccountToken(organizationId: string): Promise<string> {
    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId },
    })
    if (!integration || !integration.isActive) {
      throw new Error("No active accounting integration found")
    }
    return decrypt(integration.accountToken)
  }

  /**
   * Make an authenticated request to the Merge API
   */
  private static async request<T>(
    url: string,
    options: {
      method?: string
      accountToken?: string
      body?: Record<string, unknown>
      params?: Record<string, string>
    } = {}
  ): Promise<T> {
    const { method = "GET", accountToken, body, params } = options

    const requestUrl = new URL(url)
    if (params) {
      Object.entries(params).forEach(([k, v]) => requestUrl.searchParams.set(k, v))
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getApiKey()}`,
      "Content-Type": "application/json",
    }
    if (accountToken) {
      headers["X-Account-Token"] = accountToken
    }

    const resp = await fetch(requestUrl.toString(), {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Merge API error (${resp.status}): ${text}`)
    }

    return resp.json()
  }

  // ============================================
  // Link & Authentication
  // ============================================

  /**
   * Create a Merge Link token for the embedded connection component
   */
  static async createLinkToken(data: {
    endUserEmail: string
    endUserOrganizationName: string
    endUserOriginId: string
  }): Promise<MergeLinkTokenResponse> {
    return this.request<MergeLinkTokenResponse>(
      `${MERGE_INTEGRATIONS_URL}/create-link-token`,
      {
        method: "POST",
        body: {
          end_user_email_address: data.endUserEmail,
          end_user_organization_name: data.endUserOrganizationName,
          end_user_origin_id: data.endUserOriginId,
          categories: ["accounting"],
          common_models: [
            { model_id: "accounting.Account", enabled_actions: ["FETCH"] },
            { model_id: "accounting.Contact", enabled_actions: ["FETCH"] },
            { model_id: "accounting.Invoice", enabled_actions: ["FETCH"] },
            { model_id: "accounting.JournalEntry", enabled_actions: ["FETCH"] },
            { model_id: "accounting.Payment", enabled_actions: ["FETCH"] },
            { model_id: "accounting.GeneralLedgerTransaction", enabled_actions: ["FETCH"] },
            { model_id: "accounting.GeneralLedgerTransactionLine", enabled_actions: ["FETCH"] },
          ],
        },
      }
    )
  }

  /**
   * Exchange a public token (from Merge Link) for a permanent account token
   */
  static async exchangePublicToken(
    publicToken: string
  ): Promise<MergeAccountTokenResponse> {
    return this.request<MergeAccountTokenResponse>(
      `${MERGE_INTEGRATIONS_URL}/account-token/${publicToken}`,
      { method: "GET" }
    )
  }

  /**
   * Delete a linked account from Merge.
   * POST https://api.merge.dev/api/accounting/v1/delete-account
   * Requires X-Account-Token header to identify which linked account to delete.
   */
  static async deleteLinkedAccount(accountToken: string): Promise<void> {
    await this.request(`${MERGE_BASE_URL}/delete-account`, {
      method: "POST",
      accountToken,
    })
  }

  // ============================================
  // Paginated Fetch
  // ============================================

  /**
   * Fetch all pages of results from a paginated Merge endpoint
   */
  static async fetchAll<T>(
    path: string,
    accountToken: string,
    params?: Record<string, string>
  ): Promise<T[]> {
    const allResults: T[] = []
    let cursor: string | null = null

    do {
      const queryParams: Record<string, string> = {
        ...params,
        page_size: "200",
      }
      if (cursor) queryParams.cursor = cursor

      const page = await this.request<MergePaginatedResponse<T>>(
        `${MERGE_BASE_URL}${path}`,
        { accountToken, params: queryParams }
      )

      allResults.push(...page.results)

      // Extract cursor from next URL if present
      if (page.next) {
        try {
          const nextUrl = new URL(page.next)
          cursor = nextUrl.searchParams.get("cursor")
        } catch {
          cursor = null
        }
      } else {
        cursor = null
      }
    } while (cursor)

    return allResults
  }

  // ============================================
  // Model-Specific Fetchers
  // ============================================

  /**
   * Fetch contacts from the accounting system
   */
  static async fetchContacts(
    accountToken: string,
    modifiedAfter?: string
  ): Promise<MergeContact[]> {
    const params: Record<string, string> = {}
    if (modifiedAfter) params.modified_after = modifiedAfter
    return this.fetchAll<MergeContact>("/contacts", accountToken, params)
  }

  /**
   * Fetch invoices with expanded contact and line items
   */
  static async fetchInvoices(
    accountToken: string,
    modifiedAfter?: string
  ): Promise<MergeInvoice[]> {
    const params: Record<string, string> = { expand: "contact,line_items" }
    if (modifiedAfter) params.modified_after = modifiedAfter
    return this.fetchAll<MergeInvoice>("/invoices", accountToken, params)
  }

  /**
   * Fetch chart of accounts
   */
  static async fetchAccounts(
    accountToken: string,
    modifiedAfter?: string
  ): Promise<MergeAccount[]> {
    const params: Record<string, string> = {}
    if (modifiedAfter) params.modified_after = modifiedAfter
    return this.fetchAll<MergeAccount>("/accounts", accountToken, params)
  }

  /**
   * Fetch journal entries with expanded lines
   */
  static async fetchJournalEntries(
    accountToken: string,
    modifiedAfter?: string
  ): Promise<MergeJournalEntry[]> {
    const params: Record<string, string> = { expand: "lines" }
    if (modifiedAfter) params.modified_after = modifiedAfter
    return this.fetchAll<MergeJournalEntry>(
      "/journal-entries",
      accountToken,
      params
    )
  }

  /**
   * Fetch payments with expanded contact
   */
  static async fetchPayments(
    accountToken: string,
    modifiedAfter?: string
  ): Promise<MergePayment[]> {
    const params: Record<string, string> = { expand: "contact" }
    if (modifiedAfter) params.modified_after = modifiedAfter
    return this.fetchAll<MergePayment>("/payments", accountToken, params)
  }

  /**
   * Fetch general ledger transactions
   */
  static async fetchGeneralLedgerTransactions(
    accountToken: string,
    modifiedAfter?: string
  ): Promise<MergeGeneralLedgerTransaction[]> {
    const params: Record<string, string> = {}
    if (modifiedAfter) params.modified_after = modifiedAfter
    return this.fetchAll<MergeGeneralLedgerTransaction>(
      "/general-ledger-transactions",
      accountToken,
      params
    )
  }
}
