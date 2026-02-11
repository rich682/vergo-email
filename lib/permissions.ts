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
  "/api/org/accounting-calendar",
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
 * Get Prisma where clause to filter jobs by user access.
 *
 * Uses action permissions to determine if user can see all items or only their own.
 * Pass the appropriate view_all action key for the module context:
 * - "tasks:view_all" for task listings
 * - "inbox:view_all" for inbox/requests
 * - "collection:view_all" for collection
 *
 * When viewAllAction is granted → null (no filter, sees everything)
 * Otherwise → only owned, task-collaborated, or board-collaborated jobs
 */
export function getJobAccessFilter(
  userId: string,
  role: UserRole | string | undefined,
  viewAllAction?: ActionKey,
  orgActionPermissions?: OrgActionPermissions
): Prisma.TaskInstanceWhereInput | null {
  // If a viewAllAction is specified, use the action permission system
  if (viewAllAction) {
    if (canPerformAction(role, viewAllAction, orgActionPermissions)) {
      return null
    }
  } else {
    // Legacy fallback: ADMIN and MANAGER see all jobs
    const normalizedRole = role?.toUpperCase() as UserRole | undefined
    if (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER) {
      return null
    }
  }

  // Filter to owned, task-collaborated, or board-collaborated jobs
  return {
    OR: [
      { ownerId: userId },
      { collaborators: { some: { userId } } },
      { board: { collaborators: { some: { userId } } } }
    ]
  }
}

/**
 * @deprecated Use canPerformAction() instead with specific action keys.
 * No roles are read-only anymore — this always returns false.
 */
export function isReadOnly(role: UserRole | string | undefined): boolean {
  return false
}

/**
 * @deprecated Use canPerformAction() instead with specific action keys.
 * e.g. canPerformAction(role, "contacts:manage", orgActionPermissions)
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

// ─── Action Permission System ─────────────────────────────────────────────────
//
// Granular action-level permissions that control what operations each role can
// perform. These sit on top of module access (which controls sidebar/page
// visibility). Module access is checked by middleware; action permissions are
// checked by individual API route handlers.

/**
 * All granular action permission keys.
 * Format: "module:action" for readability and grouping.
 */
export type ActionKey =
  // Module Visibility
  | "module:boards"
  | "module:inbox"
  | "module:requests"
  | "module:collection"
  | "module:reports"
  | "module:forms"
  | "module:databases"
  | "module:reconciliations"
  | "module:contacts"
  // Contacts
  | "contacts:view"
  | "contacts:manage"
  | "contacts:import"
  | "contacts:manage_groups"
  | "contacts:manage_types"
  // Tasks & Boards
  | "tasks:view_all"
  | "boards:view_all"
  | "tasks:create"
  | "tasks:edit_any"
  | "tasks:delete"
  | "tasks:import"
  | "boards:manage"
  | "boards:edit_columns"
  // Labels & Attachments
  | "labels:manage"
  | "labels:apply_contacts"
  | "attachments:upload"
  // Inbox & Requests
  | "inbox:view_all"
  | "inbox:manage_requests"
  | "inbox:send_emails"
  | "inbox:manage_drafts"
  | "inbox:manage_quests"
  | "inbox:review"
  // Reports
  | "reports:view"
  | "reports:manage"
  | "reports:generate"
  // Forms
  | "forms:view"
  | "forms:manage"
  | "forms:send"
  // Databases
  | "databases:view"
  | "databases:manage"
  | "databases:import"
  // Collection
  | "collection:view_all"
  | "collection:manage"
  // Reconciliations
  | "reconciliations:view"
  | "reconciliations:manage"
  | "reconciliations:resolve"

/**
 * Per-role action permission map. Each key is a role name (MANAGER, MEMBER),
 * each value is a partial record of action keys to boolean.
 * Missing keys fall back to DEFAULT_ACTION_PERMISSIONS.
 */
export type RoleActionPermissions = Record<string, Partial<Record<ActionKey, boolean>>>

/**
 * Org-level action permissions, stored in Organization.features.roleActionPermissions.
 * null means no overrides configured (use defaults).
 */
export type OrgActionPermissions = RoleActionPermissions | null

/**
 * Category definition for the settings UI.
 */
export interface ActionCategory {
  key: string
  label: string
  actions: ActionDefinition[]
}

/**
 * Individual action definition for the settings UI and validation.
 */
export interface ActionDefinition {
  key: ActionKey
  label: string
}

/**
 * All valid action keys as an array (for validation).
 */
export const ALL_ACTION_KEYS: ActionKey[] = [
  "module:boards", "module:inbox", "module:requests", "module:collection", "module:reports", "module:forms", "module:databases", "module:reconciliations", "module:contacts",
  "contacts:view", "contacts:manage", "contacts:import", "contacts:manage_groups", "contacts:manage_types",
  "tasks:view_all", "boards:view_all", "tasks:create", "tasks:edit_any", "tasks:delete", "tasks:import", "boards:manage", "boards:edit_columns",
  "labels:manage", "labels:apply_contacts", "attachments:upload",
  "inbox:view_all", "inbox:manage_requests", "inbox:send_emails", "inbox:manage_drafts", "inbox:manage_quests", "inbox:review",
  "reports:view", "reports:manage", "reports:generate",
  "forms:view", "forms:manage", "forms:send",
  "databases:view", "databases:manage", "databases:import",
  "collection:view_all", "collection:manage",
  "reconciliations:view", "reconciliations:manage", "reconciliations:resolve",
]

/**
 * Hardcoded default action permissions per role.
 * ADMIN is not listed because ADMIN always returns true.
 */
export const DEFAULT_ACTION_PERMISSIONS: Record<string, Record<ActionKey, boolean>> = {
  MANAGER: {
    "module:boards": true,
    "module:inbox": true,
    "module:requests": true,
    "module:collection": true,
    "module:reports": true,
    "module:forms": true,
    "module:databases": true,
    "module:reconciliations": true,
    "module:contacts": true,
    "contacts:view": true,
    "contacts:manage": true,
    "contacts:import": true,
    "contacts:manage_groups": true,
    "contacts:manage_types": true,
    "tasks:view_all": true,
    "boards:view_all": true,
    "tasks:create": true,
    "tasks:edit_any": true,
    "tasks:delete": true,
    "tasks:import": true,
    "boards:manage": true,
    "boards:edit_columns": true,
    "labels:manage": true,
    "labels:apply_contacts": true,
    "attachments:upload": true,
    "inbox:view_all": true,
    "inbox:manage_requests": true,
    "inbox:send_emails": true,
    "inbox:manage_drafts": true,
    "inbox:manage_quests": true,
    "inbox:review": true,
    "reports:view": true,
    "reports:manage": true,
    "reports:generate": true,
    "forms:view": true,
    "forms:manage": true,
    "forms:send": true,
    "databases:view": true,
    "databases:manage": true,
    "databases:import": true,
    "collection:view_all": true,
    "collection:manage": true,
    "reconciliations:view": true,
    "reconciliations:manage": true,
    "reconciliations:resolve": true,
  },
  MEMBER: {
    "module:boards": true,
    "module:inbox": false,
    "module:requests": false,
    "module:collection": false,
    "module:reports": false,
    "module:forms": false,
    "module:databases": false,
    "module:reconciliations": false,
    "module:contacts": false,
    "contacts:view": true,
    "contacts:manage": false,
    "contacts:import": false,
    "contacts:manage_groups": false,
    "contacts:manage_types": false,
    "tasks:view_all": false,
    "boards:view_all": false,
    "tasks:create": true,
    "tasks:edit_any": false,
    "tasks:delete": false,
    "tasks:import": false,
    "boards:manage": false,
    "boards:edit_columns": false,
    "labels:manage": true,
    "labels:apply_contacts": true,
    "attachments:upload": true,
    "inbox:view_all": false,
    "inbox:manage_requests": false,
    "inbox:send_emails": false,
    "inbox:manage_drafts": false,
    "inbox:manage_quests": false,
    "inbox:review": false,
    "reports:view": false,
    "reports:manage": false,
    "reports:generate": false,
    "forms:view": true,
    "forms:manage": false,
    "forms:send": true,
    "databases:view": false,
    "databases:manage": false,
    "databases:import": false,
    "collection:view_all": false,
    "collection:manage": true,
    "reconciliations:view": false,
    "reconciliations:manage": false,
    "reconciliations:resolve": false,
  },
}

/**
 * Action categories for the settings UI.
 */
export const ACTION_CATEGORIES: ActionCategory[] = [
  {
    key: "module_visibility",
    label: "Module Visibility",
    actions: [
      { key: "module:boards", label: "Show Tasks module" },
      { key: "module:inbox", label: "Show Inbox module" },
      { key: "module:requests", label: "Show Requests module" },
      { key: "module:collection", label: "Show Documents module" },
      { key: "module:reports", label: "Show Reports module" },
      { key: "module:forms", label: "Show Forms module" },
      { key: "module:databases", label: "Show Databases module" },
      { key: "module:reconciliations", label: "Show Reconciliations module" },
      { key: "module:contacts", label: "Show Contacts module" },
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    actions: [
      { key: "contacts:view", label: "View contacts" },
      { key: "contacts:manage", label: "Create, edit & delete contacts" },
      { key: "contacts:import", label: "Import contacts (CSV/file)" },
      { key: "contacts:manage_groups", label: "Create, edit & delete contact groups" },
      { key: "contacts:manage_types", label: "Create & delete custom contact types" },
    ],
  },
  {
    key: "tasks_boards",
    label: "Tasks & Boards",
    actions: [
      { key: "tasks:view_all", label: "View all tasks (not just own/collaborated)" },
      { key: "boards:view_all", label: "View all boards (not just own/collaborated)" },
      { key: "tasks:create", label: "Create tasks" },
      { key: "tasks:edit_any", label: "Edit any task (not just owned)" },
      { key: "tasks:delete", label: "Delete / archive tasks" },
      { key: "tasks:import", label: "Bulk import tasks (AI / spreadsheet)" },
      { key: "boards:manage", label: "Create, edit & delete boards" },
      { key: "boards:edit_columns", label: "Edit board column configuration" },
    ],
  },
  {
    key: "labels_attachments",
    label: "Labels & Attachments",
    actions: [
      { key: "labels:manage", label: "Create, edit & delete task labels" },
      { key: "labels:apply_contacts", label: "Apply / remove labels on contacts" },
      { key: "attachments:upload", label: "Upload task attachments" },
    ],
  },
  {
    key: "inbox_requests",
    label: "Inbox & Requests",
    actions: [
      { key: "inbox:view_all", label: "View all inbox messages (not just own tasks)" },
      { key: "inbox:manage_requests", label: "Update request status, mark read, update risk" },
      { key: "inbox:send_emails", label: "Send emails & execute quests" },
      { key: "inbox:manage_drafts", label: "Create & edit email drafts" },
      { key: "inbox:manage_quests", label: "Create & manage quests" },
      { key: "inbox:review", label: "Approve/reject in review queue" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    actions: [
      { key: "reports:view", label: "View generated reports & export" },
      { key: "reports:manage", label: "Create, edit & delete report definitions" },
      { key: "reports:generate", label: "Generate reports" },
    ],
  },
  {
    key: "forms",
    label: "Forms",
    actions: [
      { key: "forms:view", label: "View form templates & submissions" },
      { key: "forms:manage", label: "Create, edit & delete form templates" },
      { key: "forms:send", label: "Send form requests to recipients" },
    ],
  },
  {
    key: "databases",
    label: "Databases",
    actions: [
      { key: "databases:view", label: "View databases & data" },
      { key: "databases:manage", label: "Create, edit & delete databases" },
      { key: "databases:import", label: "Import data & edit schema" },
    ],
  },
  {
    key: "collection",
    label: "Collection",
    actions: [
      { key: "collection:view_all", label: "View all collection items (not just own tasks)" },
      { key: "collection:manage", label: "Upload & manage collection files" },
    ],
  },
  {
    key: "reconciliations",
    label: "Reconciliations",
    actions: [
      { key: "reconciliations:view", label: "View reconciliations & run results" },
      { key: "reconciliations:manage", label: "Create, edit & delete reconciliations" },
      { key: "reconciliations:resolve", label: "Resolve exceptions in runs" },
    ],
  },
]

/**
 * Check if a user with the given role can perform a specific action.
 *
 * Resolution order:
 * 1. ADMIN: Always returns true.
 * 2. Org-level action overrides (Organization.features.roleActionPermissions).
 * 3. Hardcoded defaults (DEFAULT_ACTION_PERMISSIONS).
 */
export function canPerformAction(
  role: UserRole | string | undefined,
  action: ActionKey,
  orgActionPermissions?: OrgActionPermissions
): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  // ADMIN always has all permissions
  if (normalizedRole === UserRole.ADMIN) {
    return true
  }

  const roleKey = normalizedRole || "MEMBER"

  // Check org-level action overrides
  if (orgActionPermissions && roleKey in orgActionPermissions) {
    const roleOverrides = orgActionPermissions[roleKey]
    if (roleOverrides && action in roleOverrides) {
      return roleOverrides[action] === true
    }
  }

  // Fall back to hardcoded defaults
  const defaults = DEFAULT_ACTION_PERMISSIONS[roleKey] || DEFAULT_ACTION_PERMISSIONS.MEMBER
  return defaults[action] === true
}

/**
 * Get all effective action permissions for a role.
 * Used by the settings UI to display current state.
 */
export function getEffectiveActionPermissions(
  role: UserRole | string | undefined,
  orgActionPermissions?: OrgActionPermissions
): Record<ActionKey, boolean> {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined

  if (normalizedRole === UserRole.ADMIN) {
    const all = {} as Record<ActionKey, boolean>
    for (const key of ALL_ACTION_KEYS) {
      all[key] = true
    }
    return all
  }

  const roleKey = normalizedRole || "MEMBER"
  const defaults = { ...(DEFAULT_ACTION_PERMISSIONS[roleKey] || DEFAULT_ACTION_PERMISSIONS.MEMBER) }
  const overrides = orgActionPermissions?.[roleKey] || {}

  for (const [key, value] of Object.entries(overrides)) {
    if (key in defaults) {
      defaults[key as ActionKey] = value as boolean
    }
  }

  return defaults
}

// ─── Module Access ↔ Action Permission Bridges ────────────────────────────────

const MODULE_KEYS_LIST: ModuleKey[] = [
  "boards", "inbox", "requests", "collection", "reports",
  "forms", "databases", "reconciliations", "contacts"
]

/**
 * Derive roleDefaultModuleAccess from action permission booleans.
 * Used when saving settings: the action keys are the source of truth,
 * and roleDefaultModuleAccess is derived for middleware/sidebar consumption.
 *
 * module:X = true  → "edit" (action permissions handle granular write restrictions)
 * module:X = false → false
 */
export function deriveModuleAccessFromActions(
  actionPermissions: Partial<Record<ActionKey, boolean>>
): ModuleAccess {
  const result: ModuleAccess = {}
  for (const mod of MODULE_KEYS_LIST) {
    const key = `module:${mod}` as ActionKey
    result[mod] = actionPermissions[key] === true ? "edit" : false
  }
  return result
}

/**
 * Derive module action key booleans from existing roleDefaultModuleAccess.
 * Used when loading settings: backfills module action keys from legacy config.
 *
 * Any non-false access level ("edit", "view", "task-edit", "task-view") → true
 * false → false
 */
export function deriveActionsFromModuleAccess(
  moduleAccess: ModuleAccess
): Partial<Record<ActionKey, boolean>> {
  const result: Partial<Record<ActionKey, boolean>> = {}
  for (const mod of MODULE_KEYS_LIST) {
    const key = `module:${mod}` as ActionKey
    const level = normalizeAccessValue(moduleAccess[mod])
    result[key] = level !== false
  }
  return result
}
