/**
 * Tests for Form Formatting Utilities
 */

import { describe, it, expect } from "vitest"
import { parseFields, formatResponseValue } from "@/lib/utils/form-formatting"

// ============================================
// parseFields
// ============================================
describe("parseFields", () => {
  it("returns empty array for null", () => {
    expect(parseFields(null)).toEqual([])
  })

  it("returns empty array for undefined", () => {
    expect(parseFields(undefined)).toEqual([])
  })

  it("returns empty array for empty string", () => {
    expect(parseFields("" as any)).toEqual([])
  })

  it("parses JSON string of fields", () => {
    const json = JSON.stringify([
      { id: "1", label: "Name", type: "text" },
      { id: "2", label: "Email", type: "email" },
    ])
    const result = parseFields(json as any)
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe("Name")
  })

  it("returns empty array for invalid JSON string", () => {
    expect(parseFields("not valid json" as any)).toEqual([])
  })

  it("returns array as-is if already parsed", () => {
    const fields = [
      { id: "1", label: "Name", type: "text" } as any,
    ]
    expect(parseFields(fields)).toEqual(fields)
  })

  it("returns empty array for non-array objects", () => {
    expect(parseFields({} as any)).toEqual([])
  })
})

// ============================================
// formatResponseValue
// ============================================
describe("formatResponseValue", () => {
  describe("null/empty handling", () => {
    it("returns em dash for null", () => {
      expect(formatResponseValue(null)).toBe("—")
    })

    it("returns em dash for undefined", () => {
      expect(formatResponseValue(undefined)).toBe("—")
    })

    it("returns em dash for empty string", () => {
      expect(formatResponseValue("")).toBe("—")
    })
  })

  describe("currency formatting", () => {
    it("formats currency numbers with $ and 2 decimal places", () => {
      const result = formatResponseValue(1234.5, "currency")
      expect(result).toContain("$")
      expect(result).toContain("1,234.50") // locale-dependent but should have 2 decimals
    })

    it("formats zero currency", () => {
      const result = formatResponseValue(0, "currency")
      expect(result).toContain("$")
      expect(result).toContain("0.00")
    })

    it("only applies currency format to numbers, not strings", () => {
      // When value is a string with fieldType "currency", it falls through to String()
      expect(formatResponseValue("$100", "currency")).toBe("$100")
    })
  })

  describe("checkbox formatting", () => {
    it("formats truthy as 'Yes'", () => {
      expect(formatResponseValue(true, "checkbox")).toBe("Yes")
      expect(formatResponseValue(1, "checkbox")).toBe("Yes")
      expect(formatResponseValue("yes", "checkbox")).toBe("Yes")
    })

    it("formats falsy as 'No'", () => {
      expect(formatResponseValue(false, "checkbox")).toBe("No")
      expect(formatResponseValue(0, "checkbox")).toBe("No")
    })
  })

  describe("date formatting", () => {
    it("formats YYYY-MM-DD dates without timezone shift", () => {
      const result = formatResponseValue("2026-01-31", "date")
      // The exact format depends on locale, but it should contain "31" (not "30")
      expect(result).toContain("31")
    })

    it("handles ISO date strings", () => {
      const result = formatResponseValue("2026-03-15", "date")
      // Should contain the 15th, not shifted
      expect(result).toContain("15")
    })

    it("returns string representation for invalid dates", () => {
      // The function tries to parse, and invalid date string gets caught by catch block
      const result = formatResponseValue("not-a-date", "date")
      expect(typeof result).toBe("string")
      expect(result).not.toBe("—") // Should not return the null placeholder
    })
  })

  describe("object formatting", () => {
    it("stringifies objects", () => {
      expect(formatResponseValue({ key: "value" })).toBe('{"key":"value"}')
    })

    it("stringifies arrays", () => {
      expect(formatResponseValue([1, 2, 3])).toBe("[1,2,3]")
    })
  })

  describe("default formatting", () => {
    it("converts numbers to string", () => {
      expect(formatResponseValue(42)).toBe("42")
    })

    it("passes strings through", () => {
      expect(formatResponseValue("hello")).toBe("hello")
    })

    it("converts booleans to string", () => {
      expect(formatResponseValue(true)).toBe("true")
    })
  })
})
