import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accountingIntegration: { findUnique: vi.fn(), update: vi.fn() },
    database: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

import { AccountingSyncService } from "@/lib/services/accounting-sync.service"

describe("AccountingSyncService", () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe("applyFilters", () => {
    it("returns all rows when no filters provided", () => {
      const rows = [
        { col1: "a", col2: "1" },
        { col1: "b", col2: "2" },
      ]
      const result = AccountingSyncService.applyFilters(rows as any, [])
      expect(result).toHaveLength(2)
    })

    it("filters rows by column value", () => {
      const rows = [
        { status: "active", name: "Alice" },
        { status: "inactive", name: "Bob" },
        { status: "active", name: "Charlie" },
      ]
      const result = AccountingSyncService.applyFilters(rows as any, [
        { column: "status", value: "active" },
      ])
      expect(result).toHaveLength(2)
      expect(result.every((r: any) => r.status === "active")).toBe(true)
    })

    it("handles multiple filters (AND logic)", () => {
      const rows = [
        { status: "active", type: "invoice" },
        { status: "active", type: "payment" },
        { status: "inactive", type: "invoice" },
      ]
      const result = AccountingSyncService.applyFilters(rows as any, [
        { column: "status", value: "active" },
        { column: "type", value: "invoice" },
      ])
      expect(result).toHaveLength(1)
    })
  })
})
