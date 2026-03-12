/**
 * Tests for Permission System
 *
 * Covers the core permission checking functions that enforce role-based
 * access control across the application.
 */

import { describe, it, expect } from "vitest"
import {
  canPerformAction,
  hasModuleAccess,
  getEffectiveActionPermissions,
  canAccessRoute,
  getModuleForRoute,
  getJobAccessFilter,
  canModifyJob,
  isAdmin,
  isAdminOrManager,
  isReadOnly,
  DEFAULT_ACTION_PERMISSIONS,
  ALL_ACTION_KEYS,
  MODULE_ACTION_KEYS,
  ACTION_CATEGORIES,
  type ActionKey,
  type OrgActionPermissions,
  type ModuleKey,
} from "@/lib/permissions"

// ============================================
// canPerformAction
// ============================================
describe("canPerformAction", () => {
  describe("ADMIN role", () => {
    it("always returns true for any action", () => {
      for (const action of ALL_ACTION_KEYS) {
        expect(canPerformAction("ADMIN", action)).toBe(true)
      }
    })

    it("returns true even with restrictive org overrides", () => {
      const orgPerms: OrgActionPermissions = {
        ADMIN: { "tasks:create": false },
      }
      expect(canPerformAction("ADMIN", "tasks:create", orgPerms)).toBe(true)
    })

    it("is case-insensitive", () => {
      expect(canPerformAction("admin", "tasks:create")).toBe(true)
      expect(canPerformAction("Admin", "tasks:create")).toBe(true)
    })
  })

  describe("MANAGER role", () => {
    it("has all permissions enabled by default", () => {
      for (const action of ALL_ACTION_KEYS) {
        expect(canPerformAction("MANAGER", action)).toBe(true)
      }
    })

    it("respects org overrides that disable permissions", () => {
      const orgPerms: OrgActionPermissions = {
        MANAGER: { "tasks:delete": false },
      }
      expect(canPerformAction("MANAGER", "tasks:delete", orgPerms)).toBe(false)
      // Other permissions still work
      expect(canPerformAction("MANAGER", "tasks:create", orgPerms)).toBe(true)
    })
  })

  describe("MEMBER role", () => {
    it("only has tasks:create and attachments:upload by default", () => {
      expect(canPerformAction("MEMBER", "tasks:create")).toBe(true)
      expect(canPerformAction("MEMBER", "attachments:upload")).toBe(true)
    })

    it("does not have view/edit/delete by default", () => {
      expect(canPerformAction("MEMBER", "tasks:view_all")).toBe(false)
      expect(canPerformAction("MEMBER", "tasks:edit_any")).toBe(false)
      expect(canPerformAction("MEMBER", "tasks:delete")).toBe(false)
    })

    it("does not have inbox permissions by default", () => {
      expect(canPerformAction("MEMBER", "inbox:view_all")).toBe(false)
      expect(canPerformAction("MEMBER", "inbox:send_emails")).toBe(false)
    })

    it("does not have reports permissions by default", () => {
      expect(canPerformAction("MEMBER", "reports:view_definitions")).toBe(false)
      expect(canPerformAction("MEMBER", "reports:manage")).toBe(false)
    })

    it("does not have database permissions by default", () => {
      expect(canPerformAction("MEMBER", "databases:view_databases")).toBe(false)
      expect(canPerformAction("MEMBER", "databases:manage")).toBe(false)
    })

    it("respects org overrides that enable permissions", () => {
      const orgPerms: OrgActionPermissions = {
        MEMBER: { "inbox:view_all": true, "inbox:send_emails": true },
      }
      expect(canPerformAction("MEMBER", "inbox:view_all", orgPerms)).toBe(true)
      expect(canPerformAction("MEMBER", "inbox:send_emails", orgPerms)).toBe(true)
      // Non-overridden still use defaults
      expect(canPerformAction("MEMBER", "inbox:manage_requests", orgPerms)).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("handles undefined role (falls back to MEMBER)", () => {
      expect(canPerformAction(undefined, "tasks:create")).toBe(true)
      expect(canPerformAction(undefined, "tasks:delete")).toBe(false)
    })

    it("handles null orgActionPermissions", () => {
      expect(canPerformAction("MEMBER", "tasks:create", null)).toBe(true)
    })

    it("handles org overrides for unknown role (falls back to MEMBER)", () => {
      const orgPerms: OrgActionPermissions = {
        UNKNOWN_ROLE: { "tasks:create": false },
      }
      // Unknown role key should not affect MEMBER defaults
      expect(canPerformAction("MEMBER", "tasks:create", orgPerms)).toBe(true)
    })
  })
})

// ============================================
// hasModuleAccess
// ============================================
describe("hasModuleAccess", () => {
  it("ADMIN always has access to all modules", () => {
    const modules: ModuleKey[] = [
      "boards", "inbox", "requests", "collection", "reports",
      "forms", "databases", "reconciliations", "agents", "analysis",
    ]
    for (const mod of modules) {
      expect(hasModuleAccess("ADMIN", mod)).toBe(true)
    }
  })

  it("MANAGER has access to all modules by default", () => {
    const modules: ModuleKey[] = [
      "boards", "inbox", "requests", "collection", "reports",
      "forms", "databases", "reconciliations", "agents", "analysis",
    ]
    for (const mod of modules) {
      expect(hasModuleAccess("MANAGER", mod)).toBe(true)
    }
  })

  it("MEMBER has access to boards (via tasks:create)", () => {
    expect(hasModuleAccess("MEMBER", "boards")).toBe(true)
  })

  it("MEMBER does NOT have access to inbox by default", () => {
    expect(hasModuleAccess("MEMBER", "inbox")).toBe(false)
  })

  it("MEMBER does NOT have access to reports by default", () => {
    expect(hasModuleAccess("MEMBER", "reports")).toBe(false)
  })

  it("MEMBER does NOT have access to databases by default", () => {
    expect(hasModuleAccess("MEMBER", "databases")).toBe(false)
  })

  it("granting any module action key grants module access", () => {
    const orgPerms: OrgActionPermissions = {
      MEMBER: { "reports:view_generated": true },
    }
    expect(hasModuleAccess("MEMBER", "reports", orgPerms)).toBe(true)
  })

  it("MEMBER can gain inbox access via org override", () => {
    const orgPerms: OrgActionPermissions = {
      MEMBER: { "inbox:view_all": true },
    }
    expect(hasModuleAccess("MEMBER", "inbox", orgPerms)).toBe(true)
  })
})

// ============================================
// getEffectiveActionPermissions
// ============================================
describe("getEffectiveActionPermissions", () => {
  it("returns all true for ADMIN", () => {
    const perms = getEffectiveActionPermissions("ADMIN")
    for (const key of ALL_ACTION_KEYS) {
      expect(perms[key]).toBe(true)
    }
  })

  it("returns MANAGER defaults without overrides", () => {
    const perms = getEffectiveActionPermissions("MANAGER")
    expect(perms["tasks:create"]).toBe(true)
    expect(perms["tasks:delete"]).toBe(true)
    expect(perms["reports:manage"]).toBe(true)
  })

  it("returns MEMBER defaults without overrides", () => {
    const perms = getEffectiveActionPermissions("MEMBER")
    expect(perms["tasks:create"]).toBe(true)
    expect(perms["attachments:upload"]).toBe(true)
    expect(perms["tasks:delete"]).toBe(false)
    expect(perms["inbox:view_all"]).toBe(false)
  })

  it("applies org overrides on top of defaults", () => {
    const orgPerms: OrgActionPermissions = {
      MEMBER: { "inbox:view_all": true, "tasks:create": false },
    }
    const perms = getEffectiveActionPermissions("MEMBER", orgPerms)
    expect(perms["inbox:view_all"]).toBe(true) // Overridden to true
    expect(perms["tasks:create"]).toBe(false) // Overridden to false
    expect(perms["attachments:upload"]).toBe(true) // Default unchanged
  })

  it("handles undefined role as MEMBER", () => {
    const perms = getEffectiveActionPermissions(undefined)
    expect(perms["tasks:create"]).toBe(true)
    expect(perms["tasks:delete"]).toBe(false)
  })
})

// ============================================
// getModuleForRoute
// ============================================
describe("getModuleForRoute", () => {
  it("maps dashboard board routes", () => {
    expect(getModuleForRoute("/dashboard/boards")).toBe("boards")
    expect(getModuleForRoute("/dashboard/boards/123")).toBe("boards")
  })

  it("maps dashboard jobs routes to boards", () => {
    expect(getModuleForRoute("/dashboard/jobs")).toBe("boards")
  })

  it("maps inbox routes", () => {
    expect(getModuleForRoute("/dashboard/inbox")).toBe("inbox")
    expect(getModuleForRoute("/dashboard/inbox/message/123")).toBe("inbox")
  })

  it("maps API routes", () => {
    expect(getModuleForRoute("/api/boards")).toBe("boards")
    expect(getModuleForRoute("/api/task-instances")).toBe("boards")
    expect(getModuleForRoute("/api/reports")).toBe("reports")
    expect(getModuleForRoute("/api/databases")).toBe("databases")
  })

  it("maps requests routes", () => {
    expect(getModuleForRoute("/dashboard/requests")).toBe("requests")
    expect(getModuleForRoute("/api/requests")).toBe("requests")
  })

  it("maps agents routes", () => {
    expect(getModuleForRoute("/dashboard/agents")).toBe("agents")
    expect(getModuleForRoute("/api/agents")).toBe("agents")
  })

  it("maps analysis routes", () => {
    expect(getModuleForRoute("/dashboard/analysis")).toBe("analysis")
    expect(getModuleForRoute("/api/analysis")).toBe("analysis")
  })

  it("returns null for unknown routes", () => {
    expect(getModuleForRoute("/dashboard/unknown")).toBeNull()
    expect(getModuleForRoute("/api/unknown")).toBeNull()
    expect(getModuleForRoute("/")).toBeNull()
  })
})

// ============================================
// canAccessRoute
// ============================================
describe("canAccessRoute", () => {
  it("ADMIN can access everything", () => {
    expect(canAccessRoute("ADMIN", "/dashboard/boards")).toBe(true)
    expect(canAccessRoute("ADMIN", "/dashboard/settings")).toBe(true)
    expect(canAccessRoute("ADMIN", "/dashboard/settings/team")).toBe(true)
    expect(canAccessRoute("ADMIN", "/api/admin")).toBe(true)
  })

  it("blocks non-admin from admin-only routes", () => {
    expect(canAccessRoute("MANAGER", "/dashboard/settings")).toBe(false)
    expect(canAccessRoute("MANAGER", "/dashboard/settings/team")).toBe(false)
    expect(canAccessRoute("MEMBER", "/api/org/settings")).toBe(false)
    expect(canAccessRoute("MEMBER", "/api/admin")).toBe(false)
  })

  it("allows exempt routes for all roles", () => {
    expect(canAccessRoute("MEMBER", "/api/form-requests/token")).toBe(true)
    expect(canAccessRoute("MEMBER", "/api/form-requests/abc123/request")).toBe(true)
    expect(canAccessRoute("MEMBER", "/api/form-requests/abc123/submit")).toBe(true)
  })

  it("MEMBER can access boards (has tasks:create)", () => {
    expect(canAccessRoute("MEMBER", "/dashboard/boards")).toBe(true)
    expect(canAccessRoute("MEMBER", "/api/boards")).toBe(true)
  })

  it("MEMBER cannot access inbox by default", () => {
    expect(canAccessRoute("MEMBER", "/dashboard/inbox")).toBe(false)
    expect(canAccessRoute("MEMBER", "/api/inbox")).toBe(false)
  })

  it("MEMBER with org override can access inbox", () => {
    const orgPerms: OrgActionPermissions = {
      MEMBER: { "inbox:view_all": true },
    }
    expect(canAccessRoute("MEMBER", "/dashboard/inbox", orgPerms)).toBe(true)
  })

  it("allows unknown routes (not mapped to any module)", () => {
    expect(canAccessRoute("MEMBER", "/api/health")).toBe(true)
    expect(canAccessRoute("MEMBER", "/dashboard/profile")).toBe(true)
  })
})

// ============================================
// getJobAccessFilter
// ============================================
describe("getJobAccessFilter", () => {
  const userId = "user-123"

  it("returns null for ADMIN (no filter)", () => {
    expect(getJobAccessFilter(userId, "ADMIN", "tasks:view_all")).toBeNull()
  })

  it("returns null for MANAGER with view_all action", () => {
    expect(getJobAccessFilter(userId, "MANAGER", "tasks:view_all")).toBeNull()
  })

  it("returns filter for MEMBER without view_all", () => {
    const filter = getJobAccessFilter(userId, "MEMBER", "tasks:view_all")
    expect(filter).not.toBeNull()
    expect(filter!.OR).toBeDefined()
    expect(filter!.OR).toHaveLength(3)
    // Should include ownerId, collaborators, and board collaborators
    expect(filter!.OR).toContainEqual({ ownerId: userId })
  })

  it("returns null for MEMBER with org override granting view_all", () => {
    const orgPerms: OrgActionPermissions = {
      MEMBER: { "tasks:view_all": true },
    }
    expect(getJobAccessFilter(userId, "MEMBER", "tasks:view_all", orgPerms)).toBeNull()
  })

  it("legacy fallback: ADMIN and MANAGER see all without viewAllAction", () => {
    expect(getJobAccessFilter(userId, "ADMIN")).toBeNull()
    expect(getJobAccessFilter(userId, "MANAGER")).toBeNull()
  })

  it("legacy fallback: MEMBER gets filter without viewAllAction", () => {
    const filter = getJobAccessFilter(userId, "MEMBER")
    expect(filter).not.toBeNull()
  })
})

// ============================================
// canModifyJob
// ============================================
describe("canModifyJob", () => {
  it("ADMIN can modify any job", () => {
    expect(canModifyJob("user-1", "ADMIN", "user-2")).toBe(true)
  })

  it("MANAGER can modify any job", () => {
    expect(canModifyJob("user-1", "MANAGER", "user-2")).toBe(true)
  })

  it("MEMBER can modify own job", () => {
    expect(canModifyJob("user-1", "MEMBER", "user-1")).toBe(true)
  })

  it("MEMBER cannot modify another user's job", () => {
    expect(canModifyJob("user-1", "MEMBER", "user-2")).toBe(false)
  })
})

// ============================================
// isAdmin / isAdminOrManager
// ============================================
describe("isAdmin", () => {
  it("returns true for ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true)
  })

  it("returns false for MANAGER", () => {
    expect(isAdmin("MANAGER")).toBe(false)
  })

  it("returns false for MEMBER", () => {
    expect(isAdmin("MEMBER")).toBe(false)
  })

  it("is case-insensitive", () => {
    expect(isAdmin("admin")).toBe(true)
    expect(isAdmin("Admin")).toBe(true)
  })

  it("returns false for undefined", () => {
    expect(isAdmin(undefined)).toBe(false)
  })
})

describe("isAdminOrManager", () => {
  it("returns true for ADMIN", () => {
    expect(isAdminOrManager("ADMIN")).toBe(true)
  })

  it("returns true for MANAGER", () => {
    expect(isAdminOrManager("MANAGER")).toBe(true)
  })

  it("returns false for MEMBER", () => {
    expect(isAdminOrManager("MEMBER")).toBe(false)
  })

  it("is case-insensitive", () => {
    expect(isAdminOrManager("manager")).toBe(true)
  })
})

// ============================================
// isReadOnly (deprecated)
// ============================================
describe("isReadOnly", () => {
  it("always returns false (deprecated)", () => {
    expect(isReadOnly("ADMIN")).toBe(false)
    expect(isReadOnly("MANAGER")).toBe(false)
    expect(isReadOnly("MEMBER")).toBe(false)
    expect(isReadOnly(undefined)).toBe(false)
  })
})

// ============================================
// Data Integrity Checks
// ============================================
describe("data integrity", () => {
  it("ALL_ACTION_KEYS matches DEFAULT_ACTION_PERMISSIONS keys", () => {
    const managerKeys = Object.keys(DEFAULT_ACTION_PERMISSIONS.MANAGER) as ActionKey[]
    const memberKeys = Object.keys(DEFAULT_ACTION_PERMISSIONS.MEMBER) as ActionKey[]
    // Every key in ALL_ACTION_KEYS should be in both MANAGER and MEMBER defaults
    for (const key of ALL_ACTION_KEYS) {
      expect(managerKeys).toContain(key)
      expect(memberKeys).toContain(key)
    }
  })

  it("MANAGER defaults are all true", () => {
    for (const [key, value] of Object.entries(DEFAULT_ACTION_PERMISSIONS.MANAGER)) {
      expect(value).toBe(true)
    }
  })

  it("MEMBER defaults only have 2 true values", () => {
    const trueKeys = Object.entries(DEFAULT_ACTION_PERMISSIONS.MEMBER)
      .filter(([_, v]) => v === true)
      .map(([k]) => k)
    expect(trueKeys).toContain("tasks:create")
    expect(trueKeys).toContain("attachments:upload")
    expect(trueKeys).toHaveLength(2)
  })

  it("MODULE_ACTION_KEYS covers all modules", () => {
    const expectedModules: ModuleKey[] = [
      "boards", "inbox", "requests", "collection", "reports",
      "forms", "databases", "reconciliations", "agents", "analysis",
    ]
    for (const mod of expectedModules) {
      expect(MODULE_ACTION_KEYS[mod]).toBeDefined()
      expect(MODULE_ACTION_KEYS[mod].length).toBeGreaterThan(0)
    }
  })

  it("every action in MODULE_ACTION_KEYS is in ALL_ACTION_KEYS", () => {
    for (const [, actions] of Object.entries(MODULE_ACTION_KEYS)) {
      for (const action of actions) {
        expect(ALL_ACTION_KEYS).toContain(action)
      }
    }
  })

  it("ACTION_CATEGORIES cover all action keys", () => {
    const categorizedKeys = new Set<string>()
    for (const category of ACTION_CATEGORIES) {
      for (const action of category.actions) {
        categorizedKeys.add(action.key)
      }
    }
    for (const key of ALL_ACTION_KEYS) {
      expect(categorizedKeys.has(key)).toBe(true)
    }
  })
})
