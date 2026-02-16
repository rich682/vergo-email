"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function CreateDebugUsersButton({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setCreating(true)
    setError(null)

    try {
      const res = await fetch(`/api/companies/${orgId}/debug-users`, {
        method: "POST",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create debug users")
      }

      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
      <h2 className="text-sm font-semibold text-white mb-1">Debug Login Credentials</h2>
      <p className="text-xs text-gray-500 mb-4">
        No debug users exist for this organization. Create test logins for each role (Admin, Manager, Member).
      </p>
      {error && (
        <p className="text-xs text-red-400 mb-3">{error}</p>
      )}
      <button
        onClick={handleCreate}
        disabled={creating}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-colors
          ${creating
            ? "bg-gray-700 text-gray-400 cursor-wait"
            : "bg-amber-600 text-white hover:bg-amber-500 cursor-pointer"
          }
        `}
      >
        {creating ? "Creating..." : "Create Debug Users"}
      </button>
    </div>
  )
}
