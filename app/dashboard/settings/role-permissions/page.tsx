"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Info } from "lucide-react"
import Link from "next/link"
import { Checkbox } from "@/components/ui/checkbox"
import { ACTION_CATEGORIES, DEFAULT_ACTION_PERMISSIONS, deriveModuleAccessFromActions, deriveActionsFromModuleAccess, type ModuleAccess, type ActionKey } from "@/lib/permissions"

type ActionPermissions = Record<string, Partial<Record<ActionKey, boolean>>>

function RolePermissionsContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Action permissions state (includes module visibility keys)
  const [actionPermissions, setActionPermissions] = useState<ActionPermissions>(() => ({
    MEMBER: { ...DEFAULT_ACTION_PERMISSIONS.MEMBER },
    MANAGER: { ...DEFAULT_ACTION_PERMISSIONS.MANAGER },
  }))
  const [originalActionPermissions, setOriginalActionPermissions] = useState<ActionPermissions | null>(null)

  useEffect(() => {
    fetchRoleDefaults()
  }, [])

  const fetchRoleDefaults = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/role-permissions")
      if (response.ok) {
        const data = await response.json()

        // Start with defaults
        const mergedActions: ActionPermissions = {
          MEMBER: { ...DEFAULT_ACTION_PERMISSIONS.MEMBER },
          MANAGER: { ...DEFAULT_ACTION_PERMISSIONS.MANAGER },
        }

        // Merge org-level action permission overrides
        if (data.roleActionPermissions) {
          for (const role of ["MEMBER", "MANAGER"]) {
            if (data.roleActionPermissions[role]) {
              for (const [key, val] of Object.entries(data.roleActionPermissions[role])) {
                if (typeof val === "boolean") {
                  mergedActions[role][key as ActionKey] = val
                }
              }
            }
          }
        }

        // Backfill module visibility action keys from roleDefaultModuleAccess
        // This ensures existing orgs that configured module access before the
        // action-based system see their settings correctly in the unified table
        if (data.roleDefaultModuleAccess) {
          for (const role of ["MEMBER", "MANAGER"]) {
            const moduleAccess = data.roleDefaultModuleAccess[role] as ModuleAccess | undefined
            if (moduleAccess) {
              const derived = deriveActionsFromModuleAccess(moduleAccess)
              for (const [key, val] of Object.entries(derived)) {
                // Only backfill if this key was NOT explicitly set in roleActionPermissions
                if (!data.roleActionPermissions?.[role] || !(key in (data.roleActionPermissions[role] || {}))) {
                  mergedActions[role][key as ActionKey] = val
                }
              }
            }
          }
        }

        setActionPermissions(mergedActions)
        setOriginalActionPermissions(JSON.parse(JSON.stringify(mergedActions)))
      }
    } catch (error) {
      console.error("Error fetching role defaults:", error)
      setMessage({ type: "error", text: "Failed to load role permissions" })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      // Derive roleDefaultModuleAccess from module action keys
      const derivedModuleAccess: Record<string, ModuleAccess> = {}
      for (const role of ["MEMBER", "MANAGER"]) {
        derivedModuleAccess[role] = deriveModuleAccessFromActions(
          actionPermissions[role] || {}
        )
      }

      const response = await fetch("/api/org/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleDefaultModuleAccess: derivedModuleAccess,
          roleActionPermissions: actionPermissions,
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save role permissions")
      }

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
    if (originalActionPermissions) {
      setActionPermissions(JSON.parse(JSON.stringify(originalActionPermissions)))
    }
    setHasChanges(false)
  }

  const handleResetToSystemDefaults = () => {
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
              Configure what each role can see and do. Admin always has full access.
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
            <p>
              Admin users always have full access. These settings apply to <strong>Employee</strong> and <strong>Manager</strong> roles.
              Changes take effect within 1 minute.
            </p>
          </div>
        </div>

        <div className="max-w-4xl space-y-6">
          {/* Unified Action Permissions Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Permission
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
