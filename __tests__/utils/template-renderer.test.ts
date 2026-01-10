/**
 * Template Renderer Tests
 * 
 * Minimal deterministic tests for tag extraction and rendering.
 */

import { describe, it, expect } from "vitest"
import { extractTags, renderTemplate } from "@/lib/utils/template-renderer"
import { normalizeTagName } from "@/lib/utils/csv-parser"

describe("Template Renderer", () => {
  describe("extractTags", () => {
    it("should extract tags from template", () => {
      const template = "Hello {{First Name}}, your invoice {{Invoice Number}} is due on {{Due Date}}."
      const tags = extractTags(template)
      
      expect(tags).toHaveLength(3)
      expect(tags).toContain("First Name")
      expect(tags).toContain("Invoice Number")
      expect(tags).toContain("Due Date")
    })

    it("should handle tags with spaces", () => {
      const template = "{{First Name}} {{Last Name}}"
      const tags = extractTags(template)
      
      expect(tags).toEqual(["First Name", "Last Name"])
    })

    it("should handle duplicate tags", () => {
      const template = "{{First Name}} and {{First Name}} again"
      const tags = extractTags(template)
      
      expect(tags).toHaveLength(2)
      expect(tags).toEqual(["First Name", "First Name"])
    })

    it("should return empty array for template without tags", () => {
      const template = "Hello, this is a plain template."
      const tags = extractTags(template)
      
      expect(tags).toEqual([])
    })
  })

  describe("renderTemplate", () => {
    it("should render template with matching tags", () => {
      const template = "Hello {{First Name}}, your invoice {{Invoice Number}} is due."
      const data = {
        "First Name": "John",
        "Invoice Number": "INV-001"
      }
      const result = renderTemplate(template, data)
      
      expect(result.rendered).toBe("Hello John, your invoice INV-001 is due.")
      expect(result.missingTags).toEqual([])
      expect(result.usedTags).toHaveLength(2)
    })

    it("should handle case-insensitive matching via normalization", () => {
      const template = "Hello {{First Name}}, invoice {{Invoice Number}}."
      const data = {
        "first_name": "John", // Normalized key
        "invoice-number": "INV-001" // Normalized key
      }
      const result = renderTemplate(template, data)
      
      // Should match via normalization
      expect(result.rendered).toBe("Hello John, invoice INV-001.")
    })

    it("should detect missing tags", () => {
      const template = "Hello {{First Name}}, invoice {{Invoice Number}}."
      const data = {
        "First Name": "John"
      }
      const result = renderTemplate(template, data)
      
      expect(result.rendered).toBe("Hello John, invoice [MISSING: Invoice Number].")
      expect(result.missingTags.length).toBeGreaterThan(0)
      expect(result.missingTags).toContain("invoice_number") // Normalized
    })

    it("should handle missing values", () => {
      const template = "Hello {{First Name}}, amount: {{Amount}}."
      const data = {
        "First Name": "John",
        "Amount": "" // Empty value
      }
      const result = renderTemplate(template, data)
      
      expect(result.rendered).toBe("Hello John, amount: [MISSING: Amount].")
      expect(result.missingTags.length).toBeGreaterThan(0)
    })

    it("should handle multiple occurrences of same tag", () => {
      const template = "{{First Name}}, {{First Name}} again"
      const data = {
        "First Name": "John"
      }
      const result = renderTemplate(template, data)
      
      expect(result.rendered).toBe("John, John again")
      expect(result.missingTags).toEqual([])
    })

    it("should handle tags with different spacing/casing", () => {
      const template = "{{First Name}} {{Invoice Number}}"
      const data = {
        "first name": "John", // Different spacing
        "INVOICE_NUMBER": "INV-001" // Different casing
      }
      const result = renderTemplate(template, data)
      
      // Should match via normalization
      expect(result.rendered).toBe("John INV-001")
    })
  })
})

