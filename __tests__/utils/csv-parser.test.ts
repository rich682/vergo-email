/**
 * CSV Parser Tests
 * 
 * Minimal deterministic tests for CSV parsing and normalization.
 */

import { describe, it, expect } from "vitest"
import { parseCSV, normalizeTagName, CSVParseError } from "@/lib/utils/csv-parser"

describe("CSV Parser", () => {
  describe("normalizeTagName", () => {
    it("should normalize tag names consistently", () => {
      expect(normalizeTagName("Invoice Number")).toBe("invoice_number")
      expect(normalizeTagName("invoice-number")).toBe("invoice_number")
      expect(normalizeTagName("Invoice_Number")).toBe("invoice_number")
      expect(normalizeTagName("  First Name  ")).toBe("first_name")
      expect(normalizeTagName("Due Date")).toBe("due_date")
    })
  })

  describe("parseCSV", () => {
    it("should detect email column", () => {
      const csv = "email,Invoice Number,Amount\njohn@example.com,INV-001,100"
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(false)
      if (!("code" in result)) {
        expect(result.emailColumn).toBe("email")
        expect(result.tagColumns).toEqual(["Invoice Number", "Amount"])
        expect(result.validation.rowCount).toBe(1)
      }
    })

    it("should accept recipient_email as email column", () => {
      const csv = "recipient_email,Invoice Number\njohn@example.com,INV-001"
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(false)
      if (!("code" in result)) {
        expect(result.emailColumn).toBe("recipient_email")
        expect(result.tagColumns).toEqual(["Invoice Number"])
      }
    })

    it("should accept recipientEmail as email column", () => {
      const csv = "recipientEmail,Invoice Number\njohn@example.com,INV-001"
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(false)
      if (!("code" in result)) {
        expect(result.emailColumn).toBe("recipientEmail")
      }
    })

    it("should reject CSV without email column", () => {
      const csv = "name,Invoice Number\nJohn,INV-001"
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(true)
      if ("code" in result) {
        expect(result.code).toBe("NO_EMAIL_COLUMN")
      }
    })

    it("should detect duplicate emails", () => {
      const csv = "email,Invoice Number\njohn@example.com,INV-001\njohn@example.com,INV-002"
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(true)
      if ("code" in result) {
        expect(result.code).toBe("DUPLICATE_EMAILS")
      }
    })

    it("should detect header collisions after normalization", () => {
      const csv = "email,Invoice Number,Invoice-Number\njohn@example.com,INV-001,INV-002"
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(true)
      if ("code" in result) {
        expect(result.code).toBe("HEADER_COLLISION")
      }
    })

    it("should parse CSV with multiple rows", () => {
      const csv = `email,Invoice Number,Amount
john@example.com,INV-001,100
jane@example.com,INV-002,200`
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(false)
      if (!("code" in result)) {
        expect(result.validation.rowCount).toBe(2)
        expect(result.rows).toHaveLength(2)
        expect(result.rows[0]["Invoice Number"]).toBe("INV-001")
        expect(result.rows[1]["Invoice Number"]).toBe("INV-002")
      }
    })

    it("should detect missing values", () => {
      const csv = `email,Invoice Number,Amount
john@example.com,INV-001,100
jane@example.com,,200`
      const result = parseCSV(csv)
      
      expect("code" in result).toBe(false)
      if (!("code" in result)) {
        expect(result.validation.missingValues["Invoice Number"]).toBe(1)
        expect(result.validation.missingValues["Amount"]).toBeUndefined()
      }
    })

    it("should enforce row limit", () => {
      const rows = Array.from({ length: 5001 }, (_, i) => `email${i}@example.com,INV-${i},100`).join("\n")
      const csv = `email,Invoice Number,Amount\n${rows}`
      const result = parseCSV(csv, 5000)
      
      expect("code" in result).toBe(true)
      if ("code" in result) {
        expect(result.code).toBe("TOO_MANY_ROWS")
      }
    })

    it("should enforce column limit", () => {
      const headers = Array.from({ length: 101 }, (_, i) => `col${i}`).join(",")
      const csv = `${headers}\n${Array(101).fill("value").join(",")}`
      const result = parseCSV(csv, 5000, 100)
      
      expect("code" in result).toBe(true)
      if ("code" in result) {
        expect(result.code).toBe("TOO_MANY_COLUMNS")
      }
    })
  })
})

