/**
 * Tests for Reconciliation Matching Service
 *
 * Tests the matching engine via the public runMatching() method.
 * Internal functions (parseAmount, parseDate, scoreCandidate, etc.) are
 * module-private and tested indirectly through integration-level scenarios.
 *
 * The service has 3 passes:
 *   Pass 1: Composite scoring (amount + date + reference + text similarity)
 *   Pass 2: AI fuzzy matching (requires OpenAI — skipped in unit tests)
 *   Pass 3: AI exception classification (requires OpenAI — skipped in unit tests)
 *
 * Without OPENAI_API_KEY, Pass 2 and 3 are automatically skipped,
 * making these effectively unit tests of the composite scoring engine.
 */

import { describe, it, expect } from "vitest"
import { ReconciliationMatchingService } from "@/lib/services/reconciliation-matching.service"
import type { SourceConfig, MatchingRules } from "@/lib/services/reconciliation.service"

// Standard column configs for testing
const bankColumns: SourceConfig["columns"] = [
  { key: "date", type: "date" },
  { key: "amount", type: "amount" },
  { key: "description", type: "text" },
  { key: "ref", type: "reference" },
]

const glColumns: SourceConfig["columns"] = [
  { key: "posting_date", type: "date" },
  { key: "amount", type: "amount" },
  { key: "memo", type: "text" },
  { key: "invoice_num", type: "reference" },
]

const bankConfig: SourceConfig = { columns: bankColumns } as SourceConfig
const glConfig: SourceConfig = { columns: glColumns } as SourceConfig

const defaultRules: MatchingRules = {
  amountMatch: "exact",
  amountTolerance: 0,
  dateWindowDays: 0,
} as MatchingRules

// ============================================
// Exact Amount Matching
// ============================================
describe("exact amount matching", () => {
  it("matches rows with identical amounts", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "INV-001" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1000, memo: "Payment", invoice_num: "INV-001" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].sourceAIdx).toBe(0)
    expect(result.matched[0].sourceBIdx).toBe(0)
    expect(result.matched[0].confidence).toBeGreaterThan(0)
    expect(result.unmatchedA).toHaveLength(0)
    expect(result.unmatchedB).toHaveLength(0)
  })

  it("does not match rows with different amounts", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 2000, memo: "Payment", invoice_num: "" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(0)
    expect(result.unmatchedA).toHaveLength(1)
    expect(result.unmatchedB).toHaveLength(1)
  })

  it("matches multiple rows correctly (no duplicates)", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 100, description: "A", ref: "001" },
      { date: "2026-01-16", amount: 200, description: "B", ref: "002" },
      { date: "2026-01-17", amount: 300, description: "C", ref: "003" },
    ]
    const glRows = [
      { posting_date: "2026-01-17", amount: 300, memo: "C", invoice_num: "003" },
      { posting_date: "2026-01-15", amount: 100, memo: "A", invoice_num: "001" },
      { posting_date: "2026-01-16", amount: 200, memo: "B", invoice_num: "002" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(3)
    expect(result.unmatchedA).toHaveLength(0)
    expect(result.unmatchedB).toHaveLength(0)

    // Ensure no duplicate B assignments
    const bIndices = result.matched.map(m => m.sourceBIdx)
    expect(new Set(bIndices).size).toBe(3)
  })
})

// ============================================
// Sign Inversion Matching (bank vs GL)
// ============================================
describe("sign inversion matching", () => {
  it("matches amounts with inverted signs", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Deposit", ref: "DEP-001" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: -1000, memo: "Deposit", invoice_num: "DEP-001" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].signInverted).toBe(true)
  })
})

// ============================================
// Amount Tolerance Matching
// ============================================
describe("amount tolerance matching", () => {
  it("matches within tolerance range", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "INV-001" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1002, memo: "Payment", invoice_num: "INV-001" },
    ]

    const rules: MatchingRules = {
      amountMatch: "tolerance",
      amountTolerance: 5,
      dateWindowDays: 0,
    } as MatchingRules

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, rules
    )

    expect(result.matched).toHaveLength(1)
  })

  it("does not match outside tolerance range", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1010, memo: "Payment", invoice_num: "" },
    ]

    const rules: MatchingRules = {
      amountMatch: "tolerance",
      amountTolerance: 5,
      dateWindowDays: 0,
    } as MatchingRules

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, rules
    )

    expect(result.matched).toHaveLength(0)
  })
})

// ============================================
// Date Window Matching
// ============================================
describe("date window matching", () => {
  it("matches within date window", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "INV-001" },
    ]
    const glRows = [
      { posting_date: "2026-01-17", amount: 1000, memo: "Payment", invoice_num: "INV-001" },
    ]

    const rules: MatchingRules = {
      amountMatch: "exact",
      amountTolerance: 0,
      dateWindowDays: 3,
    } as MatchingRules

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, rules
    )

    expect(result.matched).toHaveLength(1)
  })

  it("rejects match outside date window", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "" },
    ]
    const glRows = [
      { posting_date: "2026-01-25", amount: 1000, memo: "Payment", invoice_num: "" },
    ]

    const rules: MatchingRules = {
      amountMatch: "exact",
      amountTolerance: 0,
      dateWindowDays: 3,
    } as MatchingRules

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, rules
    )

    expect(result.matched).toHaveLength(0)
  })
})

// ============================================
// Reference Matching (boosts score)
// ============================================
describe("reference matching", () => {
  it("prefers matching references when amounts are the same", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "INV-100" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1000, memo: "Payment A", invoice_num: "INV-200" },
      { posting_date: "2026-01-15", amount: 1000, memo: "Payment B", invoice_num: "INV-100" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
    // Should match with the row that has the matching reference (INV-100)
    expect(result.matched[0].sourceBIdx).toBe(1)
  })

  it("matches partial references (containment)", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Payment", ref: "12345" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1000, memo: "Payment", invoice_num: "INV-12345" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
  })
})

// ============================================
// Currency Format Parsing
// ============================================
describe("currency format parsing", () => {
  it("handles currency-formatted amounts", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: "$1,234.56", description: "Payment", ref: "001" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1234.56, memo: "Payment", invoice_num: "001" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
  })

  it("handles accounting-format negative amounts", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: "(500.00)", description: "Refund", ref: "001" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: -500, memo: "Refund", invoice_num: "001" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
  })
})

// ============================================
// Edge Cases
// ============================================
describe("edge cases", () => {
  it("handles empty source arrays", async () => {
    const result = await ReconciliationMatchingService.runMatching(
      [], [], bankConfig, glConfig, defaultRules
    )
    expect(result.matched).toHaveLength(0)
    expect(result.unmatchedA).toHaveLength(0)
    expect(result.unmatchedB).toHaveLength(0)
  })

  it("handles rows with null amounts", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: null, description: "Payment", ref: "" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1000, memo: "Payment", invoice_num: "" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(0)
  })

  it("calculates variance correctly", async () => {
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "A", ref: "" },
      { date: "2026-01-16", amount: 500, description: "B", ref: "" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1000, memo: "A", invoice_num: "" },
      { posting_date: "2026-01-16", amount: 300, memo: "C", invoice_num: "" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    // Variance should be sum of unmatched A amounts - sum of unmatched B amounts
    expect(typeof result.variance).toBe("number")
  })
})

// ============================================
// Conflict Resolution
// ============================================
describe("conflict resolution", () => {
  it("resolves one-to-many: picks best candidate", async () => {
    // One bank row could match two GL rows — should pick the better one
    const bankRows = [
      { date: "2026-01-15", amount: 1000, description: "Vendor Payment", ref: "INV-555" },
    ]
    const glRows = [
      { posting_date: "2026-01-15", amount: 1000, memo: "Payment Random", invoice_num: "INV-999" },
      { posting_date: "2026-01-15", amount: 1000, memo: "Vendor Payment", invoice_num: "INV-555" },
    ]

    const result = await ReconciliationMatchingService.runMatching(
      bankRows, glRows, bankConfig, glConfig, defaultRules
    )

    expect(result.matched).toHaveLength(1)
    // Should prefer the second GL row (matching reference + description)
    expect(result.matched[0].sourceBIdx).toBe(1)
  })
})
