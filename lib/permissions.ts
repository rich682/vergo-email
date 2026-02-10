/**
 * Permission Utilities
 *
 * Centralized permission checking for role-based access control.
 *
 * Role Model:
 * - ADMIN: Full access to everything. Can manage team, org settings, all data.
 * - MANAGER: Like ADMIN but scoped by moduleAccess. Can see all tasks (not just own).
 *            Can manage team members they supervise. Cannot change org settings.
 * - MEMBER: Can only see/edit jobs they own or collaborate on. Scoped by moduleAccess.
 * - VIEWER: (Deprecated - treated as MEMBER) Read-only access. Kept in enum for backward compatibility.
 *
 * Module Access:
 * Each user can have a `moduleAccess` JSON field that controls which dashboard
 * modules they can access. If null, defaults are applied based on role.
 * Admins always have access to all modules regardless of moduleAccess setting.
 */

import { UserRole, Prisma } from "@prisma/client"

// ─── Module Access Types ──────────────────────────────────────────────────────

/**
 * Available modules that can be toggled per user.
 * Maps to dashboard sections and their corresponding API routes.
 */
export type ModuleKey =
  | "boards"
  | "inbox"
  | "requests"
  | "collection"
  | "reports"
  | "forms"
  | "databases"
  | "reconciliations"
  | "contacts"

/**
 * Module access configuration stored on User.moduleAccess (JSON field).
 * true = user can access, false = user cannot access.
 * Missing keys inherit from role defaults.
 */
export type ModuleAccess = Partial<Record<ModuleKey, boolean>>

/**
 * Org-level role default overrides.
 * Stored in Organization.features.roleDefaultModuleAccess.
 * When present, these override the hardcoded defaults below.
 */
export type OrgRoleDefaults = Record<string, ModuleAccess> | null

/**
 * Hardcoded default module access per role (fallback when org has no overrides).
 * ADMIN always gets all (enforced in code, not here).
 * These defaults apply when User.moduleAccess is null or a key is missing,
 * AND the organization has not configured custom role defaults.
 */
export const DEFAULT_MODULE_ACCESS: Record<string, ModuleAccess> = {
  MANAGER: {
    boards: true,
    inbox: true,
    requests: true,
    collection: true,
    reports: true,
    forms: true,
    databases: true,
    reconciliations: true,
    contacts: true,
  },
  MEMBER: {
    boards: true,
    inbox: true,
    requests: false,
    collection: false,
    reports: true,
    forms: true,
    databases: false,
    reconciliations: false,
    contacts: false,
  },
  // VIEWER is deprecated - treated same as MEMBER for backward compatibility
  VIEWER: {
    boards: true,
    inbox: true,
    requests: false,
    collection: false,
    reports: true,
    forms: true,
    databases: false,
    reconciliations: false,
    contacts: false,
  },
}

/**
 * Map dashboard/API paths to module keys for access control.
 */
const MODULE_ROUTE_MAP: { path: string; module: ModuleKey }[] = [
  { path: "/dashboard/boards", module: "boards" },
  { path: "/dashboard/jobs", module: "boards" },
  { path: "/dashboard/inbox", module: "inbox" },
  { path: "/dashboard/requests", module: "requests" },
  { path: "/dashboard/collection", module: "collection" },
  { path: "/dashboard/reports", module: "reports" },
  { path: "/dashboard/forms", module: "forms" },
  { path: "/dashboard/databases", module: "databases" },
  { path: "/dashboard/reconciliations", module: "reconciliations" },
  { path: "/dashboard/contacts", module: "contacts" },
  // API route mappings
  { path: "/api/boards", module: "boards" },
  { path: "/api/task-instances", module: "boards" },
  { path: "/api/inbox", module: "inbox" },
  { path: "/api/requests", module: "requests" },
  { path: "/api/collection", module: "collection" },
  { path: "/api/reports", module: "reports" },
  { path: "/api/generated-reports", module: "reports" },
  { path: "/api/forms", module: "forms" },
  { path: "/api/form-requests", module: "forms" },
  { path: "/api/databases", module: "databases" },
  { path: "/api/reconciliations", module: "reconciliations" },
  { path: "/api/contacts", module: "contacts" },
  { path: "/api/entities", module: "contacts" },
]

/**
 * Routes that are always admin-only (settings, team management, admin tools).
 * These cannot be unlocked via moduleAccess.
 */
const ADMIN_ONLY_ROUTES = [
  "/dashboard/settings/team",
  "/dashboard/settings",
  "/api/org/settings",
  "/api/org/team",
  "/api/admin",
]

/**
 * Routes that are exempt from access checks (even if parent is restricted)
 */
const EXEMPT_ROUTES: string[] = [
  // Add any sub-routes that should be accessible to non-admins
]

// ─── Module Access Helpers ────────────────────────────────────────────────────

/**
 * Check if a user has access to a specific module.
 *
 * Resolution order:
 * 1. ADMIN: Always has access to all modules.
 * 2. User-specific override (User.moduleAccess field).
 * 3. Org-level role defaults (Organization.features.roleDefaultModuleAccess).
 * 4. Hardcoded role defaults (DEFAULT_MODULE_ACCESS).
 */
export function hasModuleAccess(
  role: UserRole | string | undefined,
  moduleAccess: ModuleAccess | null | undefined,
  module: ModuleKey,
  orgRoleDefaults?: OrgRoleDefaults
): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN always has full access
  if (normalizedRole === UserRole.ADMIN) {
    return true
  }

  // Check user-specific override first
  if (moduleAccess && module in moduleAccess) {
    return moduleAccess[module] === true
  }

  // Check org-level role defaults
  const roleKey = normalizedRole || "MEMBER"
  if (orgRoleDefaults && roleKey in orgRoleDefaults) {
    const orgDefaults = orgRoleDefaults[roleKey]
    if (orgDefaults && module in orgDefaults) {
      return orgDefaults[module] === true
    }
  }

  // Fall back to hardcoded role defaults
  const defaults = DEFAULT_MODULE_ACCESS[roleKey] || DEFAULT_MODULE_ACCESS.MEMBER
  return defaults[module] === true
}

/**
 * Get the effective module access map for a user (merging overrides with defaults).
 * Used by the frontend to show/hide sidebar items.
 *
 * Resolution order per module:
 * 1. User-specific override (moduleAccess)
 * 2. Org-level role defaults (orgRoleDefaults)
 * 3. Hardcoded role defaults (DEFAULT_MODULE_ACCESS)
 */
export function getEffectiveModuleAccess(
  role: UserRole | string | undefined,
  moduleAccess: ModuleAccess | null | undefined,
  orgRoleDefaults?: OrgRoleDefaults
): Record<ModuleKey, boolean> {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN: everything enabled
  if (normalizedRole === UserRole.ADMIN) {
    return {
      boards: true,
      inbox: true,
      requests: true,
      collection: true,
      reports: true,
      forms: true,
      databases: true,
      reconciliations: true,
      contacts: true,
    }
  }

  const roleKey = normalizedRole || "MEMBER"
  const hardcodedDefaults = DEFAULT_MODULE_ACCESS[roleKey] || DEFAULT_MODULE_ACCESS.MEMBER
  const orgDefaults = orgRoleDefaults?.[roleKey] || {}
  const overrides = moduleAccess || {}

  const result: Record<string, boolean> = {}
  const allModules: ModuleKey[] = [
    "boards", "inbox", "requests", "collection", "reports",
    "forms", "databases", "reconciliations", "contacts"
  ]

  for (const mod of allModules) {
    if (mod in overrides) {
      // User-specific override takes priority
      result[mod] = overrides[mod] === true
    } else if (mod in orgDefaults) {
      // Org-level role default
      result[mod] = orgDefaults[mod] === true
    } else {
      // Hardcoded fallback
      result[mod] = hardcodedDefaults[mod] === true
    }
  }

  return result as Record<ModuleKey, boolean>
}

/**
 * Get the module key for a given route path, if any.
 */
export function getModuleForRoute(path: string): ModuleKey | null {
  for (const mapping of MODULE_ROUTE_MAP) {
    if (path === mapping.path || path.startsWith(mapping.path + "/")) {
      return mapping.module
    }
  }
  return null
}

// ─── Route Access ─────────────────────────────────────────────────────────────

/**
 * Check if a user with the given role and module access can access a route.
 *
 * Checks in order:
 * 1. ADMIN can access everything.
 * 2. Admin-only routes (settings, team) block non-admins.
 * 3. Module-mapped routes check module access.
 * 4. Everything else is allowed.
 */
export function canAccessRoute(
  role: UserRole | string | undefined,
  path: string,
  moduleAccess?: ModuleAccess | null,
  orgRoleDefaults?: OrgRoleDefaults
): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN can access everything
  if (normalizedRole === UserRole.ADMIN) {
    return true
  }

  // Check exemptions first
  const isExempt = EXEMPT_ROUTES.some(
    exempt => path === exempt || path.startsWith(exempt + "/")
  )
  if (isExempt) {
    return true
  }

  // Check admin-only routes (settings, team management)
  for (const adminRoute of ADMIN_ONLY_ROUTES) {
    if (path === adminRoute || path.startsWith(adminRoute + "/")) {
      return false
    }
  }

  // Check module-based access
  const module = getModuleForRoute(path)
  if (module) {
    return hasModuleAccess(role, moduleAccess, module, orgRoleDefaults)
  }

  return true
}

// ─── Job/Board Access Filters ─────────────────────────────────────────────────

/**
 * Get Prisma where clause to filter jobs by user access
 *
 * ADMIN: No filter (sees all org jobs)
 * MANAGER: No filter (sees all org jobs - manages team)
 * MEMBER: Only jobs where user is owner, task collaborator, or board collaborator
 */
export function getJobAccessFilter(
  userId: string,
  role: UserRole | string | undefined
): Prisma.TaskInstanceWhereInput | null {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN and MANAGER see all jobs
  if (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER) {
    return null
  }

  // MEMBER: filter to owned, task-collaborated, or board-collaborated jobs
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } },
      { board: { collaborators: { some: { userId } } } }
    ]
  }
}

/**
 * Check if a user role is read-only (cannot create/edit/delete)
 * @deprecated VIEWER role has been removed from the system. This always returns false now.
 */
export function isReadOnly(role: UserRole | string | undefined): boolean {
  // VIEWER role deprecated - no roles are read-only anymore
  return false
}

/**
 * Check if user can modify a specific job
 *
 * ADMIN/MANAGER: Can modify any job
 * MEMBER: Can modify jobs they own
 */
export function canModifyJob(
  userId: string,
  role: UserRole | string | undefined,
  jobOwnerId: string
): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN and MANAGER can modify everything
  if (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER) {
    return true
  }

  // MEMBER (and deprecated VIEWER) can modify jobs they own
  return userId === jobOwnerId
}

/**
 * Check if user is an admin
 */
export function isAdmin(role: UserRole | string | undefined): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  return normalizedRole === UserRole.ADMIN
}

/**
 * Check if user is an admin or manager (has elevated privileges)
 */
export function isAdminOrManager(role: UserRole | string | undefined): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  return normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER
}

/**
 * Get Prisma where clause to filter boards by user access
 *
 * ADMIN/MANAGER: No filter (sees all org boards)
 * MEMBER: Only boards where user is owner or collaborator
 */
export function getBoardAccessFilter(
  userId: string,
  role: UserRole | string | undefined
): Prisma.BoardWhereInput | null {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN and MANAGER see all boards
  if (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER) {
    return null
  }

  // MEMBER: filter to owned or collaborated boards
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } }
    ]
  }
}
