"use client"

import { useState } from "react"

/**
 * Canonical list of toggleable modules.
 * Add new modules here as they become available.
 */
const MODULE_LIST = [
  { key: "expenses", label: "Expense Management", description: "Expense tracking, approvals, and reimbursements" },
  { key: "invoices", label: "Invoices / AP", description: "Invoice processing and accounts payable" },
]

interface FeatureFlagsEditorProps {
  orgId: string
  initialFeatures: Record<string, boolean>
}

export function FeatureFlagsEditor({ orgId, initialFeatures }: FeatureFlagsEditorProps) {
  const [features, setFeatures] = useState<Record<string, boolean>>(initialFeatures)
  const [updating, setUpdating] = useState<string | null>(null)

  const handleToggle = async (feature: string) => {
    const newValue = !features[feature]
    setUpdating(feature)

    // Optimistic update
    setFeatures((prev) => ({ ...prev, [feature]: newValue }))

    try {
      const res = await fetch(`/api/companies/${orgId}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, enabled: newValue }),
      })

      if (!res.ok) {
        // Revert on failure
        setFeatures((prev) => ({ ...prev, [feature]: !newValue }))
      }
    } catch {
      // Revert on error
      setFeatures((prev) => ({ ...prev, [feature]: !newValue }))
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
      <h2 className="text-sm font-semibold text-white mb-1">Module Access</h2>
      <p className="text-xs text-gray-500 mb-4">
        Toggle modules ON to redirect users to the external app. OFF shows the Book a Demo page.
      </p>
      <div className="space-y-3">
        {MODULE_LIST.map((mod) => {
          const enabled = !!features[mod.key]
          const isUpdating = updating === mod.key
          return (
            <div
              key={mod.key}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50"
            >
              <div>
                <span className="text-sm text-white font-medium">{mod.label}</span>
                <p className="text-xs text-gray-500">{mod.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${enabled ? "text-green-400" : "text-gray-500"}`}>
                  {enabled ? "Active" : "Demo"}
                </span>
                <button
                  onClick={() => handleToggle(mod.key)}
                  disabled={isUpdating}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900
                    ${enabled ? "bg-green-600" : "bg-gray-600"}
                    ${isUpdating ? "opacity-50 cursor-wait" : "cursor-pointer"}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${enabled ? "translate-x-6" : "translate-x-1"}
                    `}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
