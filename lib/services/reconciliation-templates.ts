/**
 * Reconciliation Templates
 *
 * Templates define the MATCHING LOGIC for a type of reconciliation (e.g., credit card vs AP).
 * They are system-level (managed by Vergo) and shared across all customers.
 * Each customer's ReconciliationConfig references a template and adds their own column mappings.
 *
 * Template = matching logic (same for all customers)
 * Config   = column mapping (per-customer, links to a template)
 */
import type { MatchingRules } from "./reconciliation.service"

// ── Types ──────────────────────────────────────────────────────────────

export interface ReconciliationTemplate {
  id: string
  name: string
  description: string
  category: "credit_card" | "bank" | "vendor" | "intercompany" | "custom"
  version: number

  /** What Source A (the "truth") typically looks like */
  sourceA: {
    label: string
    description: string
    expectedFormats: ("pdf" | "excel" | "csv")[]
    /** Hints for auto-mapping detected columns to roles */
    columnHints: ColumnHint[]
  }

  /** What Source B (the comparison) typically looks like */
  sourceB: {
    label: string
    description: string
    expectedFormats: ("pdf" | "excel" | "csv")[]
    columnHints: ColumnHint[]
  }

  /** The matching strategy — the domain knowledge this template encodes */
  matchingStrategy: MatchingStrategy

  /** Default matching rules pre-filled when creating a config from this template */
  defaultMatchingRules: MatchingRules
}

export interface ColumnHint {
  /** What role this column plays in matching */
  role: "date" | "amount" | "reference" | "description" | "vendor" | "category"
  /** Whether this role is required for matching to work */
  required: boolean
  /** Column name patterns to match against (case-insensitive substring) */
  hints: string[]
}

export interface MatchingStrategy {
  /** Discriminator for engine dispatch */
  type: "amount_first" | "composite"
  /** What must match first — for credit cards, always "amount" */
  primaryKey: "amount" | "date" | "reference"
  /** Amount tolerance in dollars (0.01 = penny) */
  amountTolerance: number
  /** Date window in days for confirming matches */
  dateWindowDays: number
  /** How credits/debits are represented */
  creditHandling: "negative" | "positive" | "absolute"
  /** Patterns in transaction descriptions to exclude from matching (fees, payments, etc.) */
  ignorePatterns: string[]
  /** Human-readable descriptions of what each confidence level means */
  confidenceRules: {
    matched: string
    likely: string
    unmatched: string
  }
}

// ── Templates ──────────────────────────────────────────────────────────

const CREDIT_CARD_VS_AP: ReconciliationTemplate = {
  id: "credit_card_vs_ap",
  name: "Credit Card Statement vs AP Report",
  description: "Reconcile corporate credit card transactions against accounts payable records. Matches by exact amount with date tolerance.",
  category: "credit_card",
  version: 1,

  sourceA: {
    label: "AP Report / General Ledger",
    description: "Your company's accounts payable or general ledger export",
    expectedFormats: ["excel", "csv"],
    columnHints: [
      { role: "amount", required: true, hints: ["amount", "total", "original amount", "charge", "debit", "net"] },
      { role: "date", required: true, hints: ["date", "invoice date", "posting date", "trans date", "transaction date", "gl date"] },
      { role: "reference", required: false, hints: ["invoice", "ref", "number", "check", "voucher", "document"] },
      { role: "vendor", required: false, hints: ["vendor", "payee", "supplier", "merchant"] },
      { role: "description", required: false, hints: ["description", "memo", "narration", "detail", "comment"] },
    ],
  },

  sourceB: {
    label: "Credit Card Statement",
    description: "Credit card statement from your bank (JPMorgan, Chase, Amex, etc.)",
    expectedFormats: ["pdf", "csv", "excel"],
    columnHints: [
      { role: "amount", required: true, hints: ["amount", "charge", "debit", "transaction amount"] },
      { role: "date", required: true, hints: ["date", "tran date", "transaction date", "post date", "posting date"] },
      { role: "reference", required: false, hints: ["reference", "ref", "number", "authorization"] },
      { role: "description", required: false, hints: ["description", "transaction description", "merchant", "payee"] },
      { role: "category", required: false, hints: ["category", "type", "activity", "cardholder"] },
    ],
  },

  matchingStrategy: {
    type: "amount_first",
    primaryKey: "amount",
    amountTolerance: 0.01,
    dateWindowDays: 3,
    creditHandling: "negative",
    ignorePatterns: [
      "AUTO PAYMENT",
      "FINANCE CHARGE",
      "LATE FEE",
      "LATE PAYMENT",
      "ANNUAL FEE",
      "INTEREST CHARGE",
      "CASH ADVANCE FEE",
      "FOREIGN TRANSACTION FEE",
      "PAYMENT DEDUCTION",
    ],
    confidenceRules: {
      matched: "Amount matches exactly and transaction date is within 3 days",
      likely: "Amount matches exactly but date is outside the 3-day window",
      unmatched: "No matching amount found in the other source",
    },
  },

  defaultMatchingRules: {
    amountMatch: "tolerance",
    amountTolerance: 0.01,
    dateWindowDays: 3,
    fuzzyDescription: false, // Amount-first doesn't need fuzzy description matching
    strategy: "amount_first",
    ignorePatterns: [
      "AUTO PAYMENT",
      "FINANCE CHARGE",
      "LATE FEE",
      "LATE PAYMENT",
      "ANNUAL FEE",
      "INTEREST CHARGE",
      "CASH ADVANCE FEE",
      "FOREIGN TRANSACTION FEE",
      "PAYMENT DEDUCTION",
    ],
    creditHandling: "negative",
  },
}

// ── Registry ───────────────────────────────────────────────────────────

export const RECONCILIATION_TEMPLATES: Record<string, ReconciliationTemplate> = {
  credit_card_vs_ap: CREDIT_CARD_VS_AP,
}

/** Get a template by ID */
export function getTemplate(id: string): ReconciliationTemplate | null {
  return RECONCILIATION_TEMPLATES[id] || null
}

/** List all available templates */
export function listTemplates(): ReconciliationTemplate[] {
  return Object.values(RECONCILIATION_TEMPLATES)
}

/**
 * Use template column hints to improve auto-mapping of detected columns.
 * Returns the detected columns with updated suggestedType based on template hints.
 */
export function applyTemplateColumnHints(
  detectedColumns: { key: string; label: string; suggestedType: string }[],
  hints: ColumnHint[]
): { key: string; label: string; suggestedType: string }[] {
  return detectedColumns.map((col) => {
    const lbl = col.label.toLowerCase()
    for (const hint of hints) {
      if (hint.hints.some((h) => lbl.includes(h.toLowerCase()))) {
        // Map hint role to column type
        const typeMap: Record<string, string> = {
          date: "date",
          amount: "amount",
          reference: "reference",
          description: "text",
          vendor: "text",
          category: "text",
        }
        return { ...col, suggestedType: typeMap[hint.role] || col.suggestedType }
      }
    }
    return col
  })
}
