import { describe, it, expect } from "vitest"
import {
  validateSchema,
  validateRows,
  validateRowsAgainstExisting,
  getCompositeKey,
  DatabaseSchema,
  DatabaseSchemaColumn,
  DatabaseRow,
  MAX_ROWS,
} from "@/lib/services/database.service"

// Helper to create a valid schema
function createSchema(columns: Partial<DatabaseSchemaColumn>[]): DatabaseSchema {
  return {
    columns: columns.map((col, index) => ({
      key: col.key || `col_${index}`,
      label: col.label || `Column ${index}`,
      dataType: col.dataType || "text",
      required: col.required ?? false,
      order: col.order ?? index,
    })),
    version: 1,
  }
}

describe("Database Service", () => {
  describe("validateSchema", () => {
    it("should pass for valid schema with required identifier", () => {
      const schema = createSchema([
        { key: "id", label: "ID", dataType: "text", required: true },
        { key: "name", label: "Name", dataType: "text", required: false },
      ])
      const result = validateSchema(schema, ["id"])
      expect(result).toBeNull()
    })

    it("should pass for valid schema with composite identifier", () => {
      const schema = createSchema([
        { key: "project_id", label: "Project ID", dataType: "text", required: true },
        { key: "period", label: "Period", dataType: "text", required: true },
        { key: "amount", label: "Amount", dataType: "currency", required: false },
      ])
      const result = validateSchema(schema, ["project_id", "period"])
      expect(result).toBeNull()
    })

    it("should fail when schema has no columns", () => {
      const schema: DatabaseSchema = { columns: [], version: 1 }
      const result = validateSchema(schema, ["id"])
      expect(result).toBe("Schema must have at least one column")
    })

    it("should fail when identifier column is missing", () => {
      const schema = createSchema([
        { key: "name", label: "Name", dataType: "text", required: true },
      ])
      const result = validateSchema(schema, ["id"])
      expect(result).toBe('Identifier column "id" not found in schema')
    })

    it("should fail when no identifier columns specified", () => {
      const schema = createSchema([
        { key: "id", label: "ID", dataType: "text", required: true },
      ])
      const result = validateSchema(schema, [])
      expect(result).toBe("At least one identifier column must be specified")
    })

    it("should fail when identifier column is not required", () => {
      const schema = createSchema([
        { key: "id", label: "ID", dataType: "text", required: false },
      ])
      const result = validateSchema(schema, ["id"])
      expect(result).toBe('Identifier column "ID" must be marked as required')
    })

    it("should fail when any composite identifier column is not required", () => {
      const schema = createSchema([
        { key: "project_id", label: "Project ID", dataType: "text", required: true },
        { key: "period", label: "Period", dataType: "text", required: false },
      ])
      const result = validateSchema(schema, ["project_id", "period"])
      expect(result).toBe('Identifier column "Period" must be marked as required')
    })

    it("should fail for duplicate column keys", () => {
      const schema = createSchema([
        { key: "id", label: "ID", dataType: "text", required: true },
        { key: "id", label: "Another ID", dataType: "text", required: false },
      ])
      const result = validateSchema(schema, ["id"])
      expect(result).toBe("Duplicate column key: id")
    })

    it("should fail for empty labels", () => {
      // Create schema directly to avoid helper defaults
      const schema: DatabaseSchema = {
        columns: [
          { key: "id", label: "", dataType: "text", required: true, order: 0 },
        ],
        version: 1,
      }
      const result = validateSchema(schema, ["id"])
      expect(result).toBe('Column with key "id" must have a label')
    })

    it("should fail for reserved field prefix (underscore)", () => {
      const schema = createSchema([
        { key: "_internal", label: "Internal", dataType: "text", required: true },
      ])
      const result = validateSchema(schema, ["_internal"])
      expect(result).toBe('Column key "_internal" cannot start with underscore (reserved for system use)')
    })

    it("should fail for invalid data type", () => {
      const schema = createSchema([
        { key: "id", label: "ID", dataType: "invalid" as any, required: true },
      ])
      const result = validateSchema(schema, ["id"])
      expect(result).toBe('Invalid data type "invalid" for column "ID"')
    })

    it("should pass for all valid data types", () => {
      const validTypes = ["text", "number", "date", "boolean", "currency"] as const
      for (const dataType of validTypes) {
        const schema = createSchema([
          { key: "id", label: "ID", dataType, required: true },
        ])
        const result = validateSchema(schema, ["id"])
        expect(result).toBeNull()
      }
    })
  })

  describe("validateRows", () => {
    const schema = createSchema([
      { key: "id", label: "ID", dataType: "text", required: true },
      { key: "name", label: "Name", dataType: "text", required: true },
      { key: "email", label: "Email", dataType: "text", required: false },
    ])

    it("should pass for valid rows", () => {
      const rows: DatabaseRow[] = [
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: null },
      ]
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should fail for missing required fields", () => {
      const rows: DatabaseRow[] = [
        { id: "1", name: "", email: "test@example.com" },
      ]
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Row 1: Required field "Name" is empty')
    })

    it("should fail for duplicate identifier values (single key)", () => {
      const rows: DatabaseRow[] = [
        { id: "1", name: "Alice", email: null },
        { id: "1", name: "Bob", email: null },
      ]
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes("Duplicate identifier"))).toBe(true)
    })

    it("should pass for same identifier across different composite keys", () => {
      const compositeSchema = createSchema([
        { key: "project_id", label: "Project ID", dataType: "text", required: true },
        { key: "period", label: "Period", dataType: "text", required: true },
        { key: "amount", label: "Amount", dataType: "currency", required: false },
      ])
      const rows: DatabaseRow[] = [
        { project_id: "P1", period: "Jan", amount: 100 },
        { project_id: "P1", period: "Feb", amount: 200 }, // Same project, different period - OK
      ]
      const result = validateRows(rows, compositeSchema, ["project_id", "period"])
      expect(result.valid).toBe(true)
    })

    it("should fail for duplicate composite key", () => {
      const compositeSchema = createSchema([
        { key: "project_id", label: "Project ID", dataType: "text", required: true },
        { key: "period", label: "Period", dataType: "text", required: true },
        { key: "amount", label: "Amount", dataType: "currency", required: false },
      ])
      const rows: DatabaseRow[] = [
        { project_id: "P1", period: "Jan", amount: 100 },
        { project_id: "P1", period: "Jan", amount: 150 }, // Duplicate composite key
      ]
      const result = validateRows(rows, compositeSchema, ["project_id", "period"])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes("Duplicate identifier"))).toBe(true)
    })

    it("should fail when exceeding max rows", () => {
      const rows: DatabaseRow[] = Array(MAX_ROWS + 1).fill(null).map((_, i) => ({
        id: String(i),
        name: `Name ${i}`,
        email: null,
      }))
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain("Cannot import more than")
    })

    it("should pass for empty rows array", () => {
      const result = validateRows([], schema, ["id"])
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should handle null values in optional fields", () => {
      const rows: DatabaseRow[] = [
        { id: "1", name: "Alice", email: null },
      ]
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(true)
    })

    it("should handle undefined values as empty", () => {
      const rows: DatabaseRow[] = [
        { id: "1", name: "Alice" }, // email is undefined
      ]
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(true)
    })

    it("should report multiple errors across rows", () => {
      const rows: DatabaseRow[] = [
        { id: "1", name: "", email: null },
        { id: "1", name: "", email: null },
        { id: "", name: "Charlie", email: null },
      ]
      const result = validateRows(rows, schema, ["id"])
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(1)
    })
  })

  describe("getCompositeKey", () => {
    it("should generate key from single column", () => {
      const row: DatabaseRow = { id: "123", name: "Alice" }
      const key = getCompositeKey(row, ["id"])
      expect(key).toBe("123")
    })

    it("should generate key from multiple columns", () => {
      const row: DatabaseRow = { project_id: "P1", period: "Jan", amount: 100 }
      const key = getCompositeKey(row, ["project_id", "period"])
      expect(key).toBe("P1|||Jan")
    })

    it("should handle null values", () => {
      const row: DatabaseRow = { id: null, name: "Alice" }
      const key = getCompositeKey(row, ["id"])
      expect(key).toBe("")
    })
  })

  describe("validateRowsAgainstExisting", () => {
    it("should identify new rows", () => {
      const existingRows: DatabaseRow[] = [
        { id: "1", name: "Alice" },
      ]
      const newRows: DatabaseRow[] = [
        { id: "2", name: "Bob" },
        { id: "3", name: "Charlie" },
      ]
      const result = validateRowsAgainstExisting(newRows, existingRows, ["id"])
      expect(result.newRows).toHaveLength(2)
      expect(result.duplicateRows).toHaveLength(0)
    })

    it("should identify duplicate rows", () => {
      const existingRows: DatabaseRow[] = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ]
      const newRows: DatabaseRow[] = [
        { id: "1", name: "Alice Updated" }, // Duplicate
        { id: "3", name: "Charlie" },
      ]
      const result = validateRowsAgainstExisting(newRows, existingRows, ["id"])
      expect(result.newRows).toHaveLength(1)
      expect(result.duplicateRows).toHaveLength(1)
      expect(result.duplicateKeys).toContain("1")
    })

    it("should work with composite keys", () => {
      const existingRows: DatabaseRow[] = [
        { project_id: "P1", period: "Jan", amount: 100 },
      ]
      const newRows: DatabaseRow[] = [
        { project_id: "P1", period: "Jan", amount: 150 }, // Duplicate composite key
        { project_id: "P1", period: "Feb", amount: 200 }, // New
      ]
      const result = validateRowsAgainstExisting(newRows, existingRows, ["project_id", "period"])
      expect(result.newRows).toHaveLength(1)
      expect(result.duplicateRows).toHaveLength(1)
    })

    it("should handle empty existing rows", () => {
      const existingRows: DatabaseRow[] = []
      const newRows: DatabaseRow[] = [
        { id: "1", name: "Alice" },
      ]
      const result = validateRowsAgainstExisting(newRows, existingRows, ["id"])
      expect(result.newRows).toHaveLength(1)
      expect(result.duplicateRows).toHaveLength(0)
    })
  })
})
