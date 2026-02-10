/**
 * Accounting Integration - Available Sources
 *
 * GET /api/integrations/accounting/sources
 * Returns the list of available accounting data sources and their schemas.
 * Only returns data if accounting integration is connected.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Source model definitions (must match SYNCED_DATABASE_SCHEMAS in accounting-sync.service.ts)
const ACCOUNTING_SOURCES = [
  {
    key: "accounts",
    sourceType: "merge_accounts",
    name: "Chart of Accounts",
    description: "Account categories and balances",
    columns: [
      { key: "as_of_date", label: "As Of", dataType: "date" },
      { key: "remote_id", label: "ID", dataType: "text" },
      { key: "account_number", label: "Account Number", dataType: "text" },
      { key: "name", label: "Account Name", dataType: "text" },
      { key: "classification", label: "Classification", dataType: "text" },
      { key: "type", label: "Type", dataType: "text" },
      { key: "status", label: "Status", dataType: "text" },
      { key: "current_balance", label: "Current Balance", dataType: "currency" },
      { key: "currency", label: "Currency", dataType: "text" },
    ],
  },
  {
    key: "invoices",
    sourceType: "merge_invoices",
    name: "Invoices",
    description: "AR and AP invoices with status",
    columns: [
      { key: "as_of_date", label: "As Of", dataType: "date" },
      { key: "remote_id", label: "ID", dataType: "text" },
      { key: "invoice_number", label: "Invoice #", dataType: "text" },
      { key: "type", label: "Type", dataType: "text" },
      { key: "contact_name", label: "Contact", dataType: "text" },
      { key: "contact_email", label: "Contact Email", dataType: "text" },
      { key: "issue_date", label: "Issue Date", dataType: "date" },
      { key: "due_date", label: "Due Date", dataType: "date" },
      { key: "total_amount", label: "Total Amount", dataType: "currency" },
      { key: "balance", label: "Balance Due", dataType: "currency" },
      { key: "paid_amount", label: "Paid Amount", dataType: "currency" },
      { key: "status", label: "Status", dataType: "text" },
      { key: "is_overdue", label: "Overdue", dataType: "boolean" },
      { key: "days_overdue", label: "Days Overdue", dataType: "number" },
      { key: "currency", label: "Currency", dataType: "text" },
      { key: "paid_on_date", label: "Paid On", dataType: "date" },
    ],
  },
  {
    key: "invoice_line_items",
    sourceType: "merge_invoice_line_items",
    name: "Invoice Line Items",
    description: "Individual line items from invoices",
    columns: [
      { key: "as_of_date", label: "As Of", dataType: "date" },
      { key: "invoice_remote_id", label: "Invoice ID", dataType: "text" },
      { key: "invoice_number", label: "Invoice #", dataType: "text" },
      { key: "description", label: "Description", dataType: "text" },
      { key: "quantity", label: "Quantity", dataType: "number" },
      { key: "unit_price", label: "Unit Price", dataType: "currency" },
      { key: "total_amount", label: "Total", dataType: "currency" },
      { key: "account", label: "Account", dataType: "text" },
    ],
  },
  {
    key: "journal_entries",
    sourceType: "merge_journal_entries",
    name: "Journal Entries",
    description: "Debit/credit journal entries (one row per line)",
    columns: [
      { key: "as_of_date", label: "As Of", dataType: "date" },
      { key: "remote_id", label: "Entry ID", dataType: "text" },
      { key: "line_id", label: "Line ID", dataType: "text" },
      { key: "transaction_date", label: "Date", dataType: "date" },
      { key: "period", label: "Period", dataType: "text" },
      { key: "journal_number", label: "Journal #", dataType: "text" },
      { key: "memo", label: "Memo", dataType: "text" },
      { key: "account", label: "Account", dataType: "text" },
      { key: "debit", label: "Debit", dataType: "currency" },
      { key: "credit", label: "Credit", dataType: "currency" },
      { key: "description", label: "Line Description", dataType: "text" },
      { key: "contact", label: "Contact", dataType: "text" },
    ],
  },
  {
    key: "payments",
    sourceType: "merge_payments",
    name: "Payments",
    description: "Payment records",
    columns: [
      { key: "as_of_date", label: "As Of", dataType: "date" },
      { key: "remote_id", label: "ID", dataType: "text" },
      { key: "transaction_date", label: "Date", dataType: "date" },
      { key: "contact_name", label: "Contact", dataType: "text" },
      { key: "total_amount", label: "Amount", dataType: "currency" },
      { key: "currency", label: "Currency", dataType: "text" },
      { key: "reference", label: "Reference", dataType: "text" },
      { key: "account", label: "Account", dataType: "text" },
    ],
  },
  {
    key: "gl_transactions",
    sourceType: "merge_gl_transactions",
    name: "General Ledger",
    description: "All GL transactions (one row per line)",
    columns: [
      { key: "as_of_date", label: "As Of", dataType: "date" },
      { key: "remote_id", label: "Transaction ID", dataType: "text" },
      { key: "line_id", label: "Line ID", dataType: "text" },
      { key: "date", label: "Date", dataType: "date" },
      { key: "period", label: "Period", dataType: "text" },
      { key: "account", label: "Account", dataType: "text" },
      { key: "debit", label: "Debit", dataType: "currency" },
      { key: "credit", label: "Credit", dataType: "currency" },
      { key: "description", label: "Description", dataType: "text" },
      { key: "transaction_type", label: "Transaction Type", dataType: "text" },
      { key: "reference_id", label: "Reference ID", dataType: "text" },
    ],
  },
]

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Check if accounting integration is connected
    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: user.organizationId },
    })

    if (!integration || !integration.isActive) {
      return NextResponse.json({ sources: [], connected: false })
    }

    return NextResponse.json({
      sources: ACCOUNTING_SOURCES,
      connected: true,
      integrationName: integration.integrationName,
    })
  } catch (error) {
    console.error("Error fetching accounting sources:", error)
    return NextResponse.json(
      { error: "Failed to fetch accounting sources" },
      { status: 500 }
    )
  }
}
