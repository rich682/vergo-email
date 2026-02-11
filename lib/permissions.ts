/**
 * Permission Utilities
 *
 * Centralized permission checking for role-based access control.
 *
 * Role Model:
 * - ADMIN: Full access to everything. Can manage team, org settings, all data.
 * - MANAGER: Scoped by role defaults. Can see all tasks (not just own).
 *            Can manage team members they supervise. Cannot change org settings.
 * - MEMBER: Can only see/edit jobs they own or collaborate on. Scoped by role defaults.
 * - VIEWER: (Deprecated - treated as MEMBER) Kept in enum for backward compatibility.
 *
 * Module Access (Role-Based Only):
 * Access is determined purely by role. Org admins can customize per-role defaults
 * via the Role Permissions settings page. There are no per-user overrides.
 *
 * Module Access Levels:
 * - false: No access to the module anywhere
 * - "task-view": No sidebar link, but tab visible in tasks user is linked to (read-only)
 * - "task-edit": No sidebar link, but tab visible in tasks user is linked to (can modify)
 * - "view": Sidebar link visible, can see all data (read-only)
 * - "edit": Full access — sidebar link visible, can create/edit/delete
 * - true: Legacy value, treated as "edit" for backward compatibility
 *
 * Task-Scoped Modules (support "task-view" and "task-edit"):
 * requests, collection, reports, reconciliations
 *
 * Sidebar-Only Modules (only support false / "view" / "edit"):
 * boards, inbox, forms, databases, contacts
 */

import { UserRole, Prisma } from "@prisma/client"

// ─── Module Access Types ──────────────────────────────────────────────────────

/**
 * Available modules that can be toggled per role.
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
 * Modules that support task-scoped access (shown as tabs within tasks).
 * These modules can have "task-view" and "task-edit" levels in addition to
 * the standard false / "view" / "edit".
 */
export const TASK_SCOPED_MODULES: ModuleKey[] = [
  "requests", "collection", "reports", "forms", "reconciliations"
]

/**
 * Access level for a module.
 * - "task-view": visible as tab in tasks the user is linked to (read-only)
 * - "task-edit": visible as tab in tasks the user is linked to (can modify)
 * - "view": visible in sidebar and tasks (read-only)
 * - "edit": visible in sidebar and tasks (full access)
 */
export type ModuleAccessLevel = "task-view" | "task-edit" | "view" | "edit"

/**
 * Module access value as stored in config.
 * Supports legacy boolean values and all string levels:
 * - true = full access (treated as "edit")
 * - false = no access
 * - "task-view" = task-scoped read-only
 * - "task-edit" = task-scoped full access
 * - "view" = sidebar read-only access
 * - "edit" = sidebar full access
 */
export type ModuleAccessValue = boolean | ModuleAccessLevel
export type ModuleAccess = Partial<Record<ModuleKey, ModuleAccessValue>>

/**
 * Org-level role default overrides.
 * Stored in Organization.features.roleDefaultModuleAccess.
 * When present, these override the hardcoded defaults below.
 */
export type OrgRoleDefaults = Record<string, ModuleAccess> | null

// ─── Normalization & Helper Functions ─────────────────────────────────────────

/**
 * Normalize a module access value to a consistent level.
 * true → "edit", false → false, string values pass through if valid.
 */
export function normalizeAccessValue(val: ModuleAccessValue | undefined): ModuleAccessLevel | false {
  if (val === true || val === "edit") return "edit"
  if (val === "view") return "view"
  if (val === "task-edit") return "task-edit"
  if (val === "task-view") return "task-view"
  return false
}

/**
 * Check if a value grants any access (any non-false level).
 */
function isAccessGranted(val: ModuleAccessValue | undefined): boolean {
  return val === true || val === "view" || val === "edit" || val === "task-view" || val === "task-edit"
}

/**
 * Does this access level grant sidebar/page access?
 * Only "view" and "edit" show the module in the sidebar.
 * Task-scoped levels ("task-view", "task-edit") do NOT show in sidebar.
 */
export function hasSidebarAccess(level: ModuleAccessLevel | false): boolean {
  return level === "view" || level === "edit"
}

/**
 * Does this access level grant task-tab visibility?
 * Any non-false level shows the tab within tasks the user is linked to.
 */
export function hasTaskTabAccess(level: ModuleAccessLevel | false): boolean {
  return level !== false
}

/**
 * Is the access level read-only (no create/edit/delete)?
 * "view" and "task-view" are read-only.
 * "edit" and "task-edit" allow modifications.
 * false means no access at all.
 */
export function isModuleReadOnly(level: ModuleAccessLevel | false): boolean {
  return level === "view" || level === "task-view"
}

/**
 * Hardcoded default module access per role (fallback when org has no overrides).
 * ADMIN always gets all (enforced in code, not here).
 * These defaults apply when the organization has not configured custom role defaults.
 */
export const DEFAULT_MODULE_ACCESS: Record<string, ModuleAccess> = {
  MANAGER: {
    boards: "edit",
    inbox: "edit",
    requests: "edit",
    collection: "edit",
    reports: "edit",
    forms: "edit",
    databases: "edit",
    reconciliations: "edit",
    contacts: "edit",
  },
  MEMBER: {
    boards: "edit",
    inbox: false,
    requests: false,
    collection: false,
    reports: false,
    forms: false,
    databases: false,
    reconciliations: false,
    contacts: false,
  },
  // VIEWER is deprecated - treated same as MEMBER for backward compatibility
  VIEWER: {
    boards: "edit",
    inbox: false,
    requests: false,
    collection: false,
    reports: false,
    forms: false,
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
 * These cannot be unlocked via role defaults.
 */
const ADMIN_ONLY_ROUTES = [
  "/dashboard/settings/team",
  "/dashboard/settings",
  "/api/org/settings",
  "/api/org/team",
  "/api/admin",
]

/**
 * Routes that are exempt from access checks (even if parent is restricted).
 * Form-filling routes are exempt because "can fill a form sent to you" is
 * separate from "can manage form templates". Recipient validation happens
 * at the route handler level, not the middleware level.
 */
const EXEMPT_ROUTES: string[] = [
  "/api/form-requests/token",  // External stakeholder token-based access
]

/**
 * Regex patterns for exempt routes that need dynamic segment matching.
 */
const EXEMPT_ROUTE_PATTERNS: RegExp[] = [
  /^\/api\/form-requests\/[^/]+\/request$/,      // GET form for filling
  /^\/api\/form-requests\/[^/]+\/submit$/,        // POST submit filled form
  /^\/api\/form-requests\/[^/]+\/attachments/,    // POST upload files during fill
  /^\/api\/form-requests\/[^/]+\/remind$/,        // POST send reminder (task owner)
]

// ─── Module Access Resolution ────────────────────────────────────────────────

/**
 * Check if a user has access to a specific module (any level).
 *
 * Resolution order (role-based only, no per-user overrides):
 * 1. ADMIN: Always has access to all modules.
 * 2. Org-level role defaults (Organization.features.roleDefaultModuleAccess).
 * 3. Hardcoded role defaults (DEFAULT_MODULE_ACCESS).
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

  // Check org-level role defaults
  const roleKey = normalizedRole || "MEMBER"
  if (orgRoleDefaults && roleKey in orgRoleDefaults) {
    const orgDefaults = orgRoleDefaults[roleKey]
    if (orgDefaults && module in orgDefaults) {
      return isAccessGranted(orgDefaults[module])
    }
  }

  // Fall back to hardcoded role defaults
  const defaults = DEFAULT_MODULE_ACCESS[roleKey] || DEFAULT_MODULE_ACCESS.MEMBER
  return isAccessGranted(defaults[module])
}

/**
 * Get the access level for a specific module.
 * Returns "edit", "view", "task-edit", "task-view", or false.
 *
 * Resolution order (role-based only):
 * 1. ADMIN: Always "edit".
 * 2. Org-level role defaults.
 * 3. Hardcoded role defaults.
 */
export function getModuleAccessLevel(
  role: UserRole | string | undefined,
  moduleAccess: ModuleAccess | null | undefined,
  module: ModuleKey,
  orgRoleDefaults?: OrgRoleDefaults
): ModuleAccessLevel | false {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN always has full access
  if (normalizedRole === UserRole.ADMIN) {
    return "edit"
  }

  // Check org-level role defaults
  const roleKey = normalizedRole || "MEMBER"
  if (orgRoleDefaults && roleKey in orgRoleDefaults) {
    const orgDefaults = orgRoleDefaults[roleKey]
    if (orgDefaults && module in orgDefaults) {
      return normalizeAccessValue(orgDefaults[module])
    }
  }

  // Fall back to hardcoded role defaults
  const defaults = DEFAULT_MODULE_ACCESS[roleKey] || DEFAULT_MODULE_ACCESS.MEMBER
  return normalizeAccessValue(defaults[module])
}

/**
 * Get the effective module access map for a role (merging org defaults with hardcoded).
 * Used by the frontend to show/hide sidebar items and control view/edit within modules.
 *
 * Returns "edit", "view", "task-edit", "task-view", or false for each module.
 *
 * Resolution order per module (role-based only):
 * 1. Org-level role defaults (orgRoleDefaults)
 * 2. Hardcoded role defaults (DEFAULT_MODULE_ACCESS)
 */
export function getEffectiveModuleAccess(
  role: UserRole | string | undefined,
  moduleAccess: ModuleAccess | null | undefined,
  orgRoleDefaults?: OrgRoleDefaults
): Record<ModuleKey, ModuleAccessLevel | false> {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN: everything enabled with full edit
  if (normalizedRole === UserRole.ADMIN) {
    return {
      boards: "edit",
      inbox: "edit",
      requests: "edit",
      collection: "edit",
      reports: "edit",
      forms: "edit",
      databases: "edit",
      reconciliations: "edit",
      contacts: "edit",
    }
  }

  const roleKey = normalizedRole || "MEMBER"
  const hardcodedDefaults = DEFAULT_MODULE_ACCESS[roleKey] || DEFAULT_MODULE_ACCESS.MEMBER
  const orgDefaults = orgRoleDefaults?.[roleKey] || {}

  const result: Record<string, ModuleAccessLevel | false> = {}
  const allModules: ModuleKey[] = [
    "boards", "inbox", "requests", "collection", "reports",
    "forms", "databases", "reconciliations", "contacts"
  ]

  for (const mod of allModules) {
    if (mod in orgDefaults) {
      // Org-level role default takes priority
      result[mod] = normalizeAccessValue(orgDefaults[mod])
    } else {
      // Hardcoded fallback
      result[mod] = normalizeAccessValue(hardcodedDefaults[mod])
    }
  }

  return result as Record<ModuleKey, ModuleAccessLevel | false>
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
 * Check if a user with the given role can access a route.
 *
 * Checks in order:
 * 1. ADMIN can access everything.
 * 2. Exempt routes are always allowed.
 * 3. Admin-only routes (settings, team) block non-admins.
 * 4. Dashboard pages require sidebar-level access ("view" or "edit").
 *    Task-scoped levels ("task-view", "task-edit") do NOT grant dashboard page access.
 * 5. API routes allow any access level (data filtering happens in handlers).
 * 6. Everything else is allowed.
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

  // Check exemptions first (static paths and regex patterns)
  const isExempt = EXEMPT_ROUTES.some(
    exempt => path === exempt || path.startsWith(exempt + "/")
  ) || EXEMPT_ROUTE_PATTERNS.some(pattern => pattern.test(path))
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
    const level = getModuleAccessLevel(role, null, module, orgRoleDefaults)

    // Dashboard pages: require sidebar-level access (view or edit)
    // Task-scoped access (task-view, task-edit) does NOT grant standalone page access
    if (path.startsWith("/dashboard/")) {
      return hasSidebarAccess(level)
    }

    // API routes: allow any access level (data filtering happens in handler)
    return level !== false
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
 * @deprecated Use canWriteToModule() instead, which checks per-module access levels.
 */
export function isReadOnly(role: UserRole | string | undefined): boolean {
  // VIEWER role deprecated - no roles are read-only anymore
  return false
}

/**
 * Check if a user can perform write operations (create/edit/delete) on a module.
 * Returns true only for "edit" or "task-edit" access levels.
 * Returns false for "view", "task-view", or no access.
 *
 * ADMIN always returns true.
 */
export function canWriteToModule(
  role: UserRole | string | undefined,
  module: ModuleKey,
  orgRoleDefaults?: OrgRoleDefaults
): boolean {
  const level = getModuleAccessLevel(role, null, module, orgRoleDefaults)
  return level === "edit" || level === "task-edit"
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
