/**
 * Tests for Email Validation Utilities
 *
 * Note: checkMxRecords and validateEmailForSend are async functions that
 * perform DNS lookups. We test the synchronous utility functions here.
 */

import { describe, it, expect } from "vitest"
import {
  isValidEmailFormat,
  extractDomain,
  suggestDomainCorrection,
} from "@/lib/utils/email-validation"

// ============================================
// isValidEmailFormat
// ============================================
describe("isValidEmailFormat", () => {
  describe("valid emails", () => {
    it("accepts standard email", () => {
      expect(isValidEmailFormat("user@example.com")).toBe(true)
    })

    it("accepts email with subdomain", () => {
      expect(isValidEmailFormat("user@mail.example.com")).toBe(true)
    })

    it("accepts email with plus addressing", () => {
      expect(isValidEmailFormat("user+tag@example.com")).toBe(true)
    })

    it("accepts email with dots in local part", () => {
      expect(isValidEmailFormat("first.last@example.com")).toBe(true)
    })

    it("accepts email with numbers", () => {
      expect(isValidEmailFormat("user123@example.com")).toBe(true)
    })

    it("accepts email with hyphens in domain", () => {
      expect(isValidEmailFormat("user@my-company.com")).toBe(true)
    })

    it("trims whitespace", () => {
      expect(isValidEmailFormat("  user@example.com  ")).toBe(true)
    })

    it("accepts email with underscore in local part", () => {
      expect(isValidEmailFormat("user_name@example.com")).toBe(true)
    })
  })

  describe("invalid emails", () => {
    it("rejects null", () => {
      expect(isValidEmailFormat(null as any)).toBe(false)
    })

    it("rejects undefined", () => {
      expect(isValidEmailFormat(undefined as any)).toBe(false)
    })

    it("rejects empty string", () => {
      expect(isValidEmailFormat("")).toBe(false)
    })

    it("rejects string without @", () => {
      expect(isValidEmailFormat("userexample.com")).toBe(false)
    })

    it("rejects string without domain", () => {
      expect(isValidEmailFormat("user@")).toBe(false)
    })

    it("rejects string without TLD", () => {
      expect(isValidEmailFormat("user@example")).toBe(false)
    })

    it("rejects string without local part", () => {
      expect(isValidEmailFormat("@example.com")).toBe(false)
    })

    it("rejects email with spaces", () => {
      expect(isValidEmailFormat("user name@example.com")).toBe(false)
    })

    it("rejects double @", () => {
      expect(isValidEmailFormat("user@@example.com")).toBe(false)
    })

    it("rejects non-string type", () => {
      expect(isValidEmailFormat(123 as any)).toBe(false)
    })
  })
})

// ============================================
// extractDomain
// ============================================
describe("extractDomain", () => {
  it("extracts domain from valid email", () => {
    expect(extractDomain("user@example.com")).toBe("example.com")
  })

  it("lowercases the domain", () => {
    expect(extractDomain("user@EXAMPLE.COM")).toBe("example.com")
  })

  it("handles subdomain", () => {
    expect(extractDomain("user@mail.example.com")).toBe("mail.example.com")
  })

  it("returns null for null/empty", () => {
    expect(extractDomain("")).toBeNull()
    expect(extractDomain(null as any)).toBeNull()
  })

  it("returns null for string without @", () => {
    expect(extractDomain("no-at-sign")).toBeNull()
  })

  it("trims whitespace", () => {
    expect(extractDomain("  user@example.com  ")).toBe("example.com")
  })
})

// ============================================
// suggestDomainCorrection
// ============================================
describe("suggestDomainCorrection", () => {
  describe("Gmail typos", () => {
    it("corrects gmial.com", () => {
      expect(suggestDomainCorrection("gmial.com")).toBe("gmail.com")
    })

    it("corrects gmal.com", () => {
      expect(suggestDomainCorrection("gmal.com")).toBe("gmail.com")
    })

    it("corrects gmai.com", () => {
      expect(suggestDomainCorrection("gmai.com")).toBe("gmail.com")
    })

    it("corrects gamil.com", () => {
      expect(suggestDomainCorrection("gamil.com")).toBe("gmail.com")
    })

    it("corrects gmil.com", () => {
      expect(suggestDomainCorrection("gmil.com")).toBe("gmail.com")
    })

    it("corrects gnail.com", () => {
      expect(suggestDomainCorrection("gnail.com")).toBe("gmail.com")
    })

    it("corrects gmail.co", () => {
      expect(suggestDomainCorrection("gmail.co")).toBe("gmail.com")
    })
  })

  describe("Outlook typos", () => {
    it("corrects outlok.com", () => {
      expect(suggestDomainCorrection("outlok.com")).toBe("outlook.com")
    })

    it("corrects outloo.com", () => {
      expect(suggestDomainCorrection("outloo.com")).toBe("outlook.com")
    })

    it("corrects outlool.com", () => {
      expect(suggestDomainCorrection("outlool.com")).toBe("outlook.com")
    })
  })

  describe("Hotmail typos", () => {
    it("corrects hotmal.com", () => {
      expect(suggestDomainCorrection("hotmal.com")).toBe("hotmail.com")
    })

    it("corrects hotmai.com", () => {
      expect(suggestDomainCorrection("hotmai.com")).toBe("hotmail.com")
    })

    it("corrects hotmial.com", () => {
      expect(suggestDomainCorrection("hotmial.com")).toBe("hotmail.com")
    })
  })

  describe("Yahoo typos", () => {
    it("corrects yaho.com", () => {
      expect(suggestDomainCorrection("yaho.com")).toBe("yahoo.com")
    })

    it("corrects yahooo.com", () => {
      expect(suggestDomainCorrection("yahooo.com")).toBe("yahoo.com")
    })

    it("corrects yhaoo.com", () => {
      expect(suggestDomainCorrection("yhaoo.com")).toBe("yahoo.com")
    })
  })

  describe("no suggestion", () => {
    it("returns null for correct domains", () => {
      expect(suggestDomainCorrection("gmail.com")).toBeNull()
      expect(suggestDomainCorrection("outlook.com")).toBeNull()
      expect(suggestDomainCorrection("yahoo.com")).toBeNull()
    })

    it("returns null for unknown domains", () => {
      expect(suggestDomainCorrection("mycompany.com")).toBeNull()
      expect(suggestDomainCorrection("example.org")).toBeNull()
    })

    it("is case-insensitive", () => {
      expect(suggestDomainCorrection("GMIAL.COM")).toBe("gmail.com")
      expect(suggestDomainCorrection("Gmial.Com")).toBe("gmail.com")
    })
  })
})
