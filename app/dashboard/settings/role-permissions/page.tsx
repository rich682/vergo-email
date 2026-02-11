"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Shield, Info } from "lucide-react"
import Link from "next/link"
import { Checkbox } from "@/components/ui/checkbox"
import { DEFAULT_MODULE_ACCESS, TASK_SCOPED_MODULES, normalizeAccessValue, ACTION_CATEGORIES, DEFAULT_ACTION_PERMISSIONS, type ModuleAccess, type ModuleKey, type ModuleAccessLevel, type ActionKey } from "@/lib/permissions"

const MODULE_LABELS: { key: ModuleKey; label: string; description: string }[] = [
  { key: "boards", label: "Tasks", description: "Task boards and job management" },
  { key: "inbox", label: "Inbox", description: "Email inbox and messaging" },
  { key: "requests", label: "Requests", description: "Send and manage requests" },
  { key: "collection", label: "Collection", description: "Document collection and storage" },
  { key: "reports", label: "Reports", description: "Financial and custom reports" },
  { key: "forms", label: "Forms", description: "Form builder and responses" },
  { key: "databases", label: "Databases", description: "Custom databases" },
  { key: "reconciliations", label: "Reconciliations", description: "Account reconciliation" },
  { key: "contacts", label: "Contacts", description: "Contact and entity management" },
]

const CONFIGURABLE_ROLES = [
  { key: "MEMBER", label: "Employee", description: "Standard team members" },
  { key: "MANAGER", label: "Manager", description: "Team leads with broader access" },
] as const

type AccessValue = ModuleAccessLevel | false
type RoleDefaults = Record<string, Record<ModuleKey, AccessValue>>

/**
 * Convert a stored AccessValue into 3 checkbox booleans
 */
function valueToCheckboxes(value: AccessValue): { sidebar: boolean; taskTab: boolean; canEdit: boolean } {
  switch (value) {
    case "edit":      return { sidebar: true,  taskTab: true,  canEdit: true }
    case "view":      return { sidebar: true,  taskTab: true,  canEdit: false }
    case "task-edit":  return { sidebar: false, taskTab: true,  canEdit: true }
    case "task-view":  return { sidebar: false, taskTab: true,  canEdit: false }
    default:          return { sidebar: false, taskTab: false, canEdit: false }
  }
}

/**
 * Convert 3 checkbox booleans back to a stored AccessValue
 */
function checkboxesToValue(sidebar: boolean, taskTab: boolean, canEdit: boolean, isTaskScoped: boolean): AccessValue {
  if (!isTaskScoped) {
    if (!sidebar) return false
    return canEdit ? "edit" : "view"
  }
  if (sidebar) return canEdit ? "edit" : "view"
  if (taskTab) return canEdit ? "task-edit" : "task-view"
  return false
}

function RolePermissionsContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [roleDefaults, setRoleDefaults] = useState<RoleDefaults>(() => {
    const allModules: ModuleKey[] = ["boards", "inbox", "requests", "collection", "reports", "forms", "databases", "reconciliations", "contacts"]
    const normalize = (src: ModuleAccess): Record<ModuleKey, AccessValue> => {
      const result = {} as Record<ModuleKey, AccessValue>
      for (const m of allModules) {
        result[m] = normalizeAccessValue(src[m])
      }
      return result
    }
    return {
      MEMBER: normalize(DEFAULT_MODULE_ACCESS.MEMBER || {}),
      MANAGER: normalize(DEFAULT_MODULE_ACCESS.MANAGER || {}),
    }
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [originalDefaults, setOriginalDefaults] = useState<RoleDefaults | null>(null)

  // Action permissions state
  type ActionPermissions = Record<string, Partial<Record<ActionKey, boolean>>>
  const [actionPermissions, setActionPermissions] = useState<ActionPermissions>(() => ({
    MEMBER: { ...DEFAULT_ACTION_PERMISSIONS.MEMBER },
    MANAGER: { ...DEFAULT_ACTION_PERMISSIONS.MANAGER },
  }))
  const [originalActionPermissions, setOriginalActionPermissions] = useState<ActionPermissions | null>(null)

  useEffect(() => {
    fetchRoleDefaults()
  }, [])

  const allModules: ModuleKey[] = ["boards", "inbox", "requests", "collection", "reports", "forms", "databases", "reconciliations", "contacts"]

  const normalizeRole = (src: ModuleAccess): Record<ModuleKey, AccessValue> => {
    const result = {} as Record<ModuleKey, AccessValue>
    for (const m of allModules) {
      result[m] = normalizeAccessValue(src[m])
    }
    return result
  }

  const fetchRoleDefaults = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/role-permissions")
      if (response.ok) {
        const data = await response.json()
        if (data.roleDefaultModuleAccess) {
          const merged: RoleDefaults = {
            MEMBER: normalizeRole(DEFAULT_MODULE_ACCESS.MEMBER || {}),
            MANAGER: normalizeRole(DEFAULT_MODULE_ACCESS.MANAGER || {}),
          }

          for (const role of ["MEMBER", "MANAGER"]) {
            if (data.roleDefaultModuleAccess[role]) {
              for (const key of Object.keys(data.roleDefaultModuleAccess[role])) {
                if (key in merged[role]) {
                  merged[role][key as ModuleKey] = normalizeAccessValue(data.roleDefaultModuleAccess[role][key])
                }
              }
            }
          }

          setRoleDefaults(merged)
          setOriginalDefaults(JSON.parse(JSON.stringify(merged)))
        } else {
          const defaults: RoleDefaults = {
            MEMBER: normalizeRole(DEFAULT_MODULE_ACCESS.MEMBER || {}),
            MANAGER: normalizeRole(DEFAULT_MODULE_ACCESS.MANAGER || {}),
          }
          setRoleDefaults(defaults)
          setOriginalDefaults(JSON.parse(JSON.stringify(defaults)))
        }

        // Load action permissions
        if (data.roleActionPermissions) {
          const mergedActions: ActionPermissions = {
            MEMBER: { ...DEFAULT_ACTION_PERMISSIONS.MEMBER },
            MANAGER: { ...DEFAULT_ACTION_PERMISSIONS.MANAGER },
          }
          for (const role of ["MEMBER", "MANAGER"]) {
            if (data.roleActionPermissions[role]) {
              for (const [key, val] of Object.entries(data.roleActionPermissions[role])) {
                if (typeof val === "boolean") {
                  mergedActions[role][key as ActionKey] = val
                }
              }
            }
          }
          setActionPermissions(mergedActions)
          setOriginalActionPermissions(JSON.parse(JSON.stringify(mergedActions)))
        } else {
          const defaultActions: ActionPermissions = {
            MEMBER: { ...DEFAULT_ACTION_PERMISSIONS.MEMBER },
            MANAGER: { ...DEFAULT_ACTION_PERMISSIONS.MANAGER },
          }
          setActionPermissions(defaultActions)
          setOriginalActionPermissions(JSON.parse(JSON.stringify(defaultActions)))
        }
      }
    } catch (error) {
      console.error("Error fetching role defaults:", error)
      setMessage({ type: "error", text: "Failed to load role permissions" })
    } finally {
      setLoading(false)
    }
  }

  const handleAccessChange = (role: string, module: ModuleKey, value: AccessValue) => {
    setRoleDefaults(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [module]: value,
      }
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const response = await fetch("/api/org/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleDefaultModuleAccess: roleDefaults,
          roleActionPermissions: actionPermissions,
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save role permissions")
      }

      setOriginalDefaults(JSON.parse(JSON.stringify(roleDefaults)))
      setOriginalActionPermissions(JSON.parse(JSON.stringify(actionPermissions)))
      setHasChanges(false)
      setMessage({ type: "success", text: "Role permissions saved successfully! Changes will apply automatically within 1 minute." })
      setTimeout(() => setMessage(null), 8000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to save" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (originalDefaults) {
      setRoleDefaults(JSON.parse(JSON.stringify(originalDefaults)))
    }
    if (originalActionPermissions) {
      setActionPermissions(JSON.parse(JSON.stringify(originalActionPermissions)))
    }
    setHasChanges(false)
  }

  const handleResetToSystemDefaults = () => {
    setRoleDefaults({
      MEMBER: normalizeRole(DEFAULT_MODULE_ACCESS.MEMBER || {}),
      MANAGER: normalizeRole(DEFAULT_MODULE_ACCESS.MANAGER || {}),
    })
    setActionPermissions({
      MEMBER: { ...DEFAULT_ACTION_PERMISSIONS.MEMBER },
      MANAGER: { ...DEFAULT_ACTION_PERMISSIONS.MANAGER },
    })
    setHasChanges(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Back button */}
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Role Permissions</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure which areas of the app each role can access by default.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Discard Changes
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Info banner */}
        <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">How permissions work</p>
            <p className="mt-1">
              Admin users always have full access. These defaults apply to Employee and Manager roles.
            </p>
            <div className="mt-2 text-xs text-blue-600 space-y-1">
              <p><strong>Can See Module</strong> — Module appears in the left navigation.</p>
              <p><strong>View in Tasks</strong> — Module appears as a tab inside tasks. Always on when Can See Module is enabled.</p>
              <p><strong>Can Edit in Task</strong> — User can create, edit, and delete within tasks. Otherwise read-only.</p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl space-y-6">
          {/* Role tables */}
          {CONFIGURABLE_ROLES.map(role => {
            const allFull = MODULE_LABELS.every(m => roleDefaults[role.key]?.[m.key] === "edit")
            return (
              <div key={role.key} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Role header */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <div>
                      <h2 className="text-sm font-medium text-gray-900">{role.label} Role</h2>
                      <p className="text-xs text-gray-500">{role.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const newVal: AccessValue = allFull ? false : "edit"
                      setRoleDefaults(prev => {
                        const updated = { ...prev[role.key] }
                        for (const m of MODULE_LABELS) {
                          updated[m.key] = newVal
                        }
                        return { ...prev, [role.key]: updated }
                      })
                      setHasChanges(true)
                    }}
                    className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {allFull ? "Disable all" : "Enable all"}
                  </button>
                </div>

                {/* Permissions table */}
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Module
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                        Can See Module
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                        View in Tasks
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                        Can Edit in Task
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {MODULE_LABELS.map(mod => {
                      const isTaskScoped = TASK_SCOPED_MODULES.includes(mod.key)
                      const storedValue = roleDefaults[role.key]?.[mod.key] ?? false
                      const { sidebar, taskTab, canEdit } = valueToCheckboxes(storedValue)

                      // Task Tab is disabled when: not task-scoped (N/A) or sidebar is on (implied)
                      const taskTabDisabled = !isTaskScoped || sidebar
                      // Can Edit: always clickable for task-scoped modules (auto-enables taskTab)
                      const canEditDisabled = isTaskScoped ? false : !sidebar

                      const handleSidebarChange = (checked: boolean) => {
                        if (checked) {
                          // Sidebar ON: taskTab implicitly true
                          handleAccessChange(role.key, mod.key, checkboxesToValue(true, true, canEdit, isTaskScoped))
                        } else {
                          if (isTaskScoped) {
                            // Sidebar OFF: keep taskTab and canEdit (downgrade edit→task-edit, view→task-view)
                            handleAccessChange(role.key, mod.key, checkboxesToValue(false, taskTab, canEdit, isTaskScoped))
                          } else {
                            // Sidebar-only: off means everything off
                            handleAccessChange(role.key, mod.key, false)
                          }
                        }
                      }

                      const handleTaskTabChange = (checked: boolean) => {
                        if (!checked) {
                          // Task Tab OFF: also force canEdit off
                          handleAccessChange(role.key, mod.key, false)
                        } else {
                          handleAccessChange(role.key, mod.key, checkboxesToValue(false, true, canEdit, isTaskScoped))
                        }
                      }

                      const handleCanEditChange = (checked: boolean) => {
                        if (isTaskScoped) {
                          // Auto-enable taskTab when enabling canEdit
                          const newTaskTab = checked ? true : taskTab
                          handleAccessChange(role.key, mod.key, checkboxesToValue(sidebar, newTaskTab, checked, isTaskScoped))
                        } else {
                          handleAccessChange(role.key, mod.key, checkboxesToValue(sidebar, sidebar, checked, isTaskScoped))
                        }
                      }

                      return (
                        <tr key={mod.key} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{mod.label}</div>
                          </td>
                          <td className="text-center px-4 py-3">
                            <Checkbox
                              checked={sidebar}
                              onCheckedChange={handleSidebarChange}
                            />
                          </td>
                          <td className="text-center px-4 py-3">
                            {isTaskScoped ? (
                              <Checkbox
                                checked={taskTab}
                                disabled={taskTabDisabled}
                                onCheckedChange={handleTaskTabChange}
                                className={taskTabDisabled && taskTab ? "opacity-60 cursor-not-allowed" : ""}
                                title={sidebar ? "Always enabled when Sidebar is on" : undefined}
                              />
                            ) : (
                              <span className="text-xs text-gray-300 select-none">N/A</span>
                            )}
                          </td>
                          <td className="text-center px-4 py-3">
                            <Checkbox
                              checked={canEdit}
                              disabled={canEditDisabled}
                              onCheckedChange={handleCanEditChange}
                              className={canEditDisabled ? "opacity-40 cursor-not-allowed" : ""}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}

          {/* ─── Action Permissions ────────────────────────────────────── */}
          <div className="mt-10 mb-2">
            <h2 className="text-base font-semibold text-gray-900">Action Permissions</h2>
            <p className="text-sm text-gray-500 mt-1">
              Control what each role can do within modules they have access to. Admin always has full access.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                    Admin
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                    Manager
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                    Employee
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ACTION_CATEGORIES.map(category => (
                  <>
                    {/* Category header row */}
                    <tr key={`cat-${category.key}`} className="bg-gray-50/70">
                      <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        {category.label}
                      </td>
                    </tr>
                    {/* Action rows */}
                    {category.actions.map(action => (
                      <tr key={action.key} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 pl-6">
                          <span className="text-sm text-gray-700">{action.label}</span>
                        </td>
                        {/* Admin — always on, disabled */}
                        <td className="text-center px-4 py-2.5">
                          <Checkbox checked={true} disabled className="opacity-60 cursor-not-allowed" />
                        </td>
                        {/* Manager */}
                        <td className="text-center px-4 py-2.5">
                          <Checkbox
                            checked={actionPermissions.MANAGER?.[action.key] ?? DEFAULT_ACTION_PERMISSIONS.MANAGER[action.key] ?? true}
                            onCheckedChange={(checked: boolean) => {
                              setActionPermissions(prev => ({
                                ...prev,
                                MANAGER: { ...prev.MANAGER, [action.key]: checked },
                              }))
                              setHasChanges(true)
                            }}
                          />
                        </td>
                        {/* Employee */}
                        <td className="text-center px-4 py-2.5">
                          <Checkbox
                            checked={actionPermissions.MEMBER?.[action.key] ?? DEFAULT_ACTION_PERMISSIONS.MEMBER[action.key] ?? false}
                            onCheckedChange={(checked: boolean) => {
                              setActionPermissions(prev => ({
                                ...prev,
                                MEMBER: { ...prev.MEMBER, [action.key]: checked },
                              }))
                              setHasChanges(true)
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reset to defaults */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <p className="text-xs text-gray-500">
              Reset all role permissions back to system defaults.
            </p>
            <button
              onClick={handleResetToSystemDefaults}
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors underline"
            >
              Reset to system defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RolePermissionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
          </div>
        </div>
      </div>
    }>
      <RolePermissionsContent />
    </Suspense>
  )
}
