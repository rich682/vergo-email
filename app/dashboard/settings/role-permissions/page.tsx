"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Shield, Info } from "lucide-react"
import Link from "next/link"
import { DEFAULT_MODULE_ACCESS, type ModuleAccess, type ModuleKey } from "@/lib/permissions"

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

type RoleDefaults = Record<string, Record<ModuleKey, boolean>>

function RolePermissionsContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [roleDefaults, setRoleDefaults] = useState<RoleDefaults>({
    MEMBER: { ...DEFAULT_MODULE_ACCESS.MEMBER } as Record<ModuleKey, boolean>,
    MANAGER: { ...DEFAULT_MODULE_ACCESS.MANAGER } as Record<ModuleKey, boolean>,
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [originalDefaults, setOriginalDefaults] = useState<RoleDefaults | null>(null)

  useEffect(() => {
    fetchRoleDefaults()
  }, [])

  const fetchRoleDefaults = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/role-permissions")
      if (response.ok) {
        const data = await response.json()
        if (data.roleDefaultModuleAccess) {
          // Merge org defaults with hardcoded defaults (org overrides hardcoded)
          const merged: RoleDefaults = {
            MEMBER: { ...(DEFAULT_MODULE_ACCESS.MEMBER as Record<ModuleKey, boolean>) },
            MANAGER: { ...(DEFAULT_MODULE_ACCESS.MANAGER as Record<ModuleKey, boolean>) },
          }

          for (const role of ["MEMBER", "MANAGER"]) {
            if (data.roleDefaultModuleAccess[role]) {
              for (const key of Object.keys(data.roleDefaultModuleAccess[role])) {
                if (key in merged[role]) {
                  (merged[role] as any)[key] = data.roleDefaultModuleAccess[role][key]
                }
              }
            }
          }

          setRoleDefaults(merged)
          setOriginalDefaults(JSON.parse(JSON.stringify(merged)))
        } else {
          // No org overrides - use hardcoded defaults
          const defaults: RoleDefaults = {
            MEMBER: { ...(DEFAULT_MODULE_ACCESS.MEMBER as Record<ModuleKey, boolean>) },
            MANAGER: { ...(DEFAULT_MODULE_ACCESS.MANAGER as Record<ModuleKey, boolean>) },
          }
          setRoleDefaults(defaults)
          setOriginalDefaults(JSON.parse(JSON.stringify(defaults)))
        }
      }
    } catch (error) {
      console.error("Error fetching role defaults:", error)
      setMessage({ type: "error", text: "Failed to load role permissions" })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (role: string, module: ModuleKey, value: boolean) => {
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
        body: JSON.stringify({ roleDefaultModuleAccess: roleDefaults })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save role permissions")
      }

      setOriginalDefaults(JSON.parse(JSON.stringify(roleDefaults)))
      setHasChanges(false)
      setMessage({ type: "success", text: "Role permissions saved successfully! Changes will take effect when users next refresh their browser." })
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
      setHasChanges(false)
    }
  }

  const handleResetToSystemDefaults = () => {
    setRoleDefaults({
      MEMBER: { ...(DEFAULT_MODULE_ACCESS.MEMBER as Record<ModuleKey, boolean>) },
      MANAGER: { ...(DEFAULT_MODULE_ACCESS.MANAGER as Record<ModuleKey, boolean>) },
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
              Individual users can be overridden in Team settings.
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
              Admin users always have access to everything. These defaults apply to Employee and Manager roles.
              You can further override access for individual users in <Link href="/dashboard/settings/team" className="underline font-medium">Team settings</Link>.
            </p>
          </div>
        </div>

        <div className="max-w-4xl space-y-6">
          {/* Role columns */}
          {CONFIGURABLE_ROLES.map(role => (
            <div key={role.key} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  <div>
                    <h2 className="text-sm font-medium text-gray-900">{role.label} Role</h2>
                    <p className="text-xs text-gray-500">{role.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      // Toggle all on/off
                      const allEnabled = MODULE_LABELS.every(m => roleDefaults[role.key]?.[m.key] === true)
                      const newVal = !allEnabled
                      setRoleDefaults(prev => {
                        const updated = { ...prev[role.key] }
                        for (const m of MODULE_LABELS) {
                          (updated as any)[m.key] = newVal
                        }
                        return { ...prev, [role.key]: updated }
                      })
                      setHasChanges(true)
                    }}
                    className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {MODULE_LABELS.every(m => roleDefaults[role.key]?.[m.key] === true)
                      ? "Disable all"
                      : "Enable all"}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {MODULE_LABELS.map(mod => (
                  <div
                    key={mod.key}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <Label className="text-sm font-medium text-gray-900 cursor-pointer">
                        {mod.label}
                      </Label>
                      <p className="text-xs text-gray-500">{mod.description}</p>
                    </div>
                    <Switch
                      checked={roleDefaults[role.key]?.[mod.key] ?? false}
                      onCheckedChange={(checked) => handleToggle(role.key, mod.key, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

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
