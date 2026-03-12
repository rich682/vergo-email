/**
 * Permission Utilities
 *
 * Centralized permission checking for role-based access control.
 *
 * Role Model:
 * - ADMIN: Full access to everything. Can manage team, org settings, all data.
 * - MANAGER: Scoped by role defaults. Can see all tasks (not just own).
 *            Can manage team members they supervise. Cannot change org settings.
 * - MEMBER: Can only see Book Close. Sees boards and tasks they collaborate on.
 *            Can comment and upload on collaborated tasks. Report access requires
 *            explicit viewer assignment. Has no configurable action permissions.
 * - VIEWER: (Deprecated - treated as MEMBER) Kept in enum for backward compatibility.
 *
 * Permission Model:
 * Module visibility (sidebar links, route access) is derived automatically from
 * action permissions. If a user has ANY action permission for a module, they can
 * see and access that module. There is no separate "module visibility" toggle.
 * MEMBER is an exception: they always have implicit access to the boards module
 * (data scoping happens at the service layer), but no configurable permissions.
 *
 * Action permissions are role-based. Org admins can customize MANAGER role defaults
 * via the Role Permissions settings page. MEMBER permissions are fixed (all false).
 */

import { UserRole, Prisma } from "@prisma/client"

// ─── Module Types ─────────────────────────────────────────────────────────────

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
  | "agents"
  | "analysis"
  | "review"

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
  { path: "/dashboard/agents", module: "agents" },
  { path: "/api/agents", module: "agents" },
  { path: "/dashboard/analysis", module: "analysis" },
  { path: "/api/analysis", module: "analysis" },
  { path: "/dashboard/review-hub", module: "review" },
  { path: "/api/review-hub", module: "review" },
]

/**
 * Routes that are always admin-only (settings, team management, admin tools).
 * These cannot be unlocked via role defaults.
 */
const ADMIN_ONLY_ROUTES = [
  "/dashboard/settings/team",
  "/dashboard/settings",
  "/api/org/settings",
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

// ─── Action Permission System ─────────────────────────────────────────────────
//
// Granular action-level permissions that control what operations each role can
// perform. Module visibility (sidebar/route access) is derived automatically:
// if a user has ANY action permission for a module, they can access it.

/**
 * All granular action permission keys.
 * Format: "module:action" for readability and grouping.
 */
export type ActionKey =
  // Tasks & Boards
  | "tasks:view_all"
  | "boards:view_all"
  | "tasks:create"
  | "tasks:edit_any"
  | "tasks:delete"
  | "tasks:import"
  | "boards:manage"
  | "boards:edit_columns"
  // Attachments
  | "attachments:upload"
  // Inbox
  | "inbox:view_all"
  | "inbox:manage_requests"
  | "inbox:send_emails"
  | "inbox:manage_drafts"
  | "inbox:manage_quests"
  | "inbox:review"
  // Requests
  | "requests:view"
  | "requests:manage"
  // Reports
  | "reports:view_all_definitions"
  | "reports:view_generated"
  | "reports:manage"
  | "reports:generate"
  // Forms
  | "forms:view_all_templates"
  | "forms:view_submissions"
  | "forms:manage"
  | "forms:send"
  // Databases
  | "databases:view_all_databases"
  | "databases:view_data"
  | "databases:manage"
  | "databases:import"
  // Collection
  | "collection:view_all"
  | "collection:manage"
  // Reconciliations
  | "reconciliations:view_all_configs"
  | "reconciliations:view_runs"
  | "reconciliations:manage"
  | "reconciliations:resolve"
  // Agents
  | "agents:view"
  | "agents:manage"
  | "agents:execute"
  // Analysis
  | "analysis:view"
  | "analysis:view_all"
  | "analysis:manage"
  | "analysis:query"
  // Review Hub
  | "review:view"
  | "review:manage"

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
  "tasks:view_all", "boards:view_all", "tasks:create", "tasks:edit_any", "tasks:delete", "tasks:import", "boards:manage", "boards:edit_columns",
  "attachments:upload",
  "inbox:view_all", "inbox:manage_requests", "inbox:send_emails", "inbox:manage_drafts", "inbox:manage_quests", "inbox:review",
  "requests:view", "requests:manage",
  "reports:view_all_definitions", "reports:view_generated", "reports:manage", "reports:generate",
  "forms:view_all_templates", "forms:view_submissions", "forms:manage", "forms:send",
  "databases:view_all_databases", "databases:view_data", "databases:manage", "databases:import",
  "collection:view_all", "collection:manage",
  "reconciliations:view_all_configs", "reconciliations:view_runs", "reconciliations:manage", "reconciliations:resolve",
  "agents:view", "agents:manage", "agents:execute",
  "analysis:view", "analysis:view_all", "analysis:manage", "analysis:query",
  "review:view", "review:manage",
]

/**
 * Hardcoded default action permissions per role.
 * ADMIN is not listed because ADMIN always returns true.
 *
 * MEMBER: All permissions are false. MEMBER has no configurable permissions.
 * Their access is implicit: boards module via MEMBER_IMPLICIT_MODULES,
 * task scoping via getJobAccessFilter, report access via viewer tables.
 */
export const DEFAULT_ACTION_PERMISSIONS: Record<string, Record<ActionKey, boolean>> = {
  MANAGER: {
    "tasks:view_all": true,
    "boards:view_all": true,
    "tasks:create": true,
    "tasks:edit_any": true,
    "tasks:delete": true,
    "tasks:import": true,
    "boards:manage": true,
    "boards:edit_columns": true,
    "attachments:upload": true,
    "inbox:view_all": true,
    "inbox:manage_requests": true,
    "inbox:send_emails": true,
    "inbox:manage_drafts": true,
    "inbox:manage_quests": true,
    "inbox:review": true,
    "requests:view": true,
    "requests:manage": true,
    "reports:view_all_definitions": true,
    "reports:view_generated": true,
    "reports:manage": true,
    "reports:generate": true,
    "forms:view_all_templates": true,
    "forms:view_submissions": true,
    "forms:manage": true,
    "forms:send": true,
    "databases:view_all_databases": true,
    "databases:view_data": true,
    "databases:manage": true,
    "databases:import": true,
    "collection:view_all": true,
    "collection:manage": true,
    "reconciliations:view_all_configs": true,
    "reconciliations:view_runs": true,
    "reconciliations:manage": true,
    "reconciliations:resolve": true,
    "agents:view": true,
    "agents:manage": true,
    "agents:execute": true,
    "analysis:view": true,
    "analysis:view_all": true,
    "analysis:manage": true,
    "analysis:query": true,
    "review:view": true,
    "review:manage": true,
  },
  MEMBER: {
    "tasks:view_all": false,
    "boards:view_all": false,
    "tasks:create": false,
    "tasks:edit_any": false,
    "tasks:delete": false,
    "tasks:import": false,
    "boards:manage": false,
    "boards:edit_columns": false,
    "attachments:upload": false,
    "inbox:view_all": false,
    "inbox:manage_requests": false,
    "inbox:send_emails": false,
    "inbox:manage_drafts": false,
    "inbox:manage_quests": false,
    "inbox:review": false,
    "requests:view": false,
    "requests:manage": false,
    "reports:view_all_definitions": false,
    "reports:view_generated": false,
    "reports:manage": false,
    "reports:generate": false,
    "forms:view_all_templates": false,
    "forms:view_submissions": false,
    "forms:manage": false,
    "forms:send": false,
    "databases:view_all_databases": false,
    "databases:view_data": false,
    "databases:manage": false,
    "databases:import": false,
    "collection:view_all": false,
    "collection:manage": false,
    "reconciliations:view_all_configs": false,
    "reconciliations:view_runs": false,
    "reconciliations:manage": false,
    "reconciliations:resolve": false,
    "agents:view": false,
    "agents:manage": false,
    "agents:execute": false,
    "analysis:view": false,
    "analysis:view_all": false,
    "analysis:manage": false,
    "analysis:query": false,
    "review:view": false,
    "review:manage": false,
  },
}

/**
 * Action categories for the settings UI.
 */
export const ACTION_CATEGORIES: ActionCategory[] = [
  {
    key: "tasks_boards",
    label: "Tasks & Boards",
    actions: [
      { key: "tasks:view_all", label: "View all tasks" },
      { key: "boards:view_all", label: "View all boards" },
      { key: "tasks:create", label: "Create tasks" },
      { key: "tasks:edit_any", label: "Edit any task" },
      { key: "tasks:delete", label: "Delete tasks" },
      { key: "tasks:import", label: "Import tasks" },
      { key: "boards:manage", label: "Manage boards & months" },
      { key: "boards:edit_columns", label: "Edit board columns" },
    ],
  },
  {
    key: "attachments",
    label: "Attachments",
    actions: [
      { key: "attachments:upload", label: "Upload task attachments" },
    ],
  },
  {
    key: "inbox",
    label: "Inbox",
    actions: [
      { key: "inbox:view_all", label: "View inbox" },
      { key: "inbox:manage_requests", label: "Update request status & risk" },
      { key: "inbox:send_emails", label: "Send emails" },
      { key: "inbox:manage_drafts", label: "Create & edit drafts" },
      { key: "inbox:manage_quests", label: "Create & manage requests" },
      { key: "inbox:review", label: "Approve/reject in review queue" },
    ],
  },
  {
    key: "requests",
    label: "Requests",
    actions: [
      { key: "requests:view", label: "View requests" },
      { key: "requests:manage", label: "Manage requests" },
      { key: "collection:view_all", label: "View collection" },
      { key: "collection:manage", label: "Manage collection files" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    actions: [
      { key: "reports:view_all_definitions", label: "View reports" },
      { key: "reports:view_generated", label: "View generated reports" },
      { key: "reports:manage", label: "Create & manage reports" },
      { key: "reports:generate", label: "Generate reports" },
    ],
  },
  {
    key: "forms",
    label: "Forms",
    actions: [
      { key: "forms:view_all_templates", label: "View forms" },
      { key: "forms:view_submissions", label: "View submissions" },
      { key: "forms:manage", label: "Create & manage forms" },
      { key: "forms:send", label: "Send form requests" },
    ],
  },
  {
    key: "databases",
    label: "Databases",
    actions: [
      { key: "databases:view_all_databases", label: "View databases" },
      { key: "databases:view_data", label: "View data & export" },
      { key: "databases:manage", label: "Create & manage databases" },
      { key: "databases:import", label: "Import data & edit schema" },
    ],
  },
  {
    key: "reconciliations",
    label: "Reconciliations",
    actions: [
      { key: "reconciliations:view_all_configs", label: "View reconciliations" },
      { key: "reconciliations:view_runs", label: "View runs & results" },
      { key: "reconciliations:manage", label: "Create & manage reconciliations" },
      { key: "reconciliations:resolve", label: "Resolve exceptions" },
    ],
  },
  {
    key: "agents",
    label: "Agents",
    actions: [
      { key: "agents:view", label: "View agents" },
      { key: "agents:manage", label: "Create & manage agents" },
      { key: "agents:execute", label: "Run agents" },
    ],
  },
  {
    key: "analysis",
    label: "Analysis",
    actions: [
      { key: "analysis:view", label: "View analysis" },
      { key: "analysis:view_all", label: "View all analysis" },
      { key: "analysis:manage", label: "Manage datasets" },
      { key: "analysis:query", label: "Query data" },
    ],
  },
  {
    key: "review",
    label: "Review Hub",
    actions: [
      { key: "review:view", label: "View review hub" },
      { key: "review:manage", label: "Review & approve items" },
    ],
  },
]

// ─── Module → Action Key Mapping ──────────────────────────────────────────────

/**
 * Maps each module to the action keys that grant access to it.
 * If a user has ANY of these action keys enabled, the module is visible
 * in the sidebar and accessible via routes.
 */
export const MODULE_ACTION_KEYS: Record<ModuleKey, ActionKey[]> = {
  boards:          ["tasks:view_all", "boards:view_all", "tasks:create", "tasks:edit_any", "tasks:delete", "tasks:import", "boards:manage", "boards:edit_columns"],
  inbox:           ["inbox:view_all", "inbox:manage_requests", "inbox:send_emails", "inbox:manage_drafts", "inbox:manage_quests", "inbox:review"],
  requests:        ["requests:view", "requests:manage"],
  collection:      ["collection:view_all", "collection:manage"],
  reports:         ["reports:view_all_definitions", "reports:view_generated", "reports:manage", "reports:generate"],
  forms:           ["forms:view_all_templates", "forms:view_submissions", "forms:manage", "forms:send"],
  databases:       ["databases:view_all_databases", "databases:view_data", "databases:manage", "databases:import"],
  reconciliations: ["reconciliations:view_all_configs", "reconciliations:view_runs", "reconciliations:manage", "reconciliations:resolve"],
  agents:          ["agents:view", "agents:manage", "agents:execute"],
  analysis:        ["analysis:view", "analysis:view_all", "analysis:manage", "analysis:query"],
  review:          ["review:view", "review:manage"],
}

// ─── MEMBER Implicit Access ───────────────────────────────────────────────────

/**
 * Modules that MEMBER can always access at the route/middleware level,
 * even with zero action permissions. Actual data scoping happens at the
 * service layer (getJobAccessFilter, getBoardAccessFilter, viewer checks).
 */
const MEMBER_IMPLICIT_MODULES: ModuleKey[] = ["boards"]

/**
 * Additional API route prefixes that MEMBER can access without module permissions.
 * These are needed because report data is loaded from within the task detail page
 * (which is in the boards module), but the API routes map to the reports module.
 * Sidebar visibility is NOT affected — only route-level access.
 */
const MEMBER_IMPLICIT_API_ROUTES: string[] = [
  "/api/reports",
  "/api/generated-reports",
]

// ─── Core Permission Functions ────────────────────────────────────────────────

/**
 * Check if a user with the given role can perform a specific action.
 *
 * Resolution order:
 * 1. ADMIN: Always returns true.
 * 2. MEMBER: Always returns false (no configurable permissions).
 * 3. Org-level action overrides (Organization.features.roleActionPermissions).
 * 4. Hardcoded defaults (DEFAULT_ACTION_PERMISSIONS).
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

  // MEMBER has no configurable permissions — skip org overrides, return false
  if (roleKey === "MEMBER" || roleKey === "VIEWER") {
    return false
  }

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
 * Check if a user has access to a module by checking if ANY of the module's
 * action keys are enabled. This drives sidebar visibility and route access.
 *
 * ADMIN always has access to all modules.
 * MEMBER has implicit access to MEMBER_IMPLICIT_MODULES (boards).
 */
export function hasModuleAccess(
  role: UserRole | string | undefined,
  module: ModuleKey,
  orgActionPermissions?: OrgActionPermissions
): boolean {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined
  if (normalizedRole === UserRole.ADMIN) return true

  // MEMBER has implicit access to boards (data scoping at service layer)
  if ((normalizedRole === UserRole.MEMBER || normalizedRole === "VIEWER" as any) &&
      MEMBER_IMPLICIT_MODULES.includes(module)) {
    return true
  }

  const actionKeys = MODULE_ACTION_KEYS[module]
  if (!actionKeys) return false

  return actionKeys.some(key => canPerformAction(role, key, orgActionPermissions))
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

  // MEMBER has no configurable permissions — always return all-false defaults
  if (roleKey === "MEMBER" || roleKey === "VIEWER") {
    return { ...DEFAULT_ACTION_PERMISSIONS.MEMBER }
  }

  const defaults = { ...(DEFAULT_ACTION_PERMISSIONS[roleKey] || DEFAULT_ACTION_PERMISSIONS.MEMBER) }
  const overrides = orgActionPermissions?.[roleKey] || {}

  for (const [key, value] of Object.entries(overrides)) {
    if (key in defaults) {
      defaults[key as ActionKey] = value as boolean
    }
  }

  return defaults
}

// ─── Route Access ─────────────────────────────────────────────────────────────

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

/**
 * Check if a user with the given role can access a route.
 *
 * Checks in order:
 * 1. ADMIN can access everything.
 * 2. Exempt routes are always allowed.
 * 3. Admin-only routes (settings, team) block non-admins.
 * 4. Module routes: user must have at least one action permission for the module.
 * 5. Everything else is allowed.
 */
export function canAccessRoute(
  role: UserRole | string | undefined,
  path: string,
  orgActionPermissions?: OrgActionPermissions
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

  // Check module-based access — derived from action permissions
  const module = getModuleForRoute(path)
  if (module) {
    // MEMBER has implicit API route access for reports (loaded from task detail)
    const isMember = normalizedRole === UserRole.MEMBER || normalizedRole === "VIEWER" as any
    if (isMember && MEMBER_IMPLICIT_API_ROUTES.some(prefix => path === prefix || path.startsWith(prefix + "/"))) {
      return true
    }

    return hasModuleAccess(role, module, orgActionPermissions)
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
