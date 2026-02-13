"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Users, X, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"

export interface Viewer {
  userId: string
  name: string | null
  email: string
}

interface ViewerManagementProps {
  /** API entity type — used to build the viewers API path */
  entityType: "reports" | "forms" | "reconciliations" | "databases"
  /** Entity ID (report definition, form definition, config, or database ID) */
  entityId: string
  /** Current viewers list */
  viewers: Viewer[]
  /** Called when viewers change (after successful API save) */
  onViewersChange: (viewers: Viewer[]) => void
  /** Disable all interactions */
  disabled?: boolean
}

export function ViewerManagement({
  entityType,
  entityId,
  viewers,
  onViewersChange,
  disabled = false,
}: ViewerManagementProps) {
  const [orgUsers, setOrgUsers] = useState<Array<{ id: string; name: string | null; email: string }>>([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  // Fetch org users on mount
  useEffect(() => {
    async function fetchOrgUsers() {
      try {
        const response = await fetch("/api/users", { credentials: "include" })
        if (response.ok) {
          const data = await response.json()
          setOrgUsers(
            (data.users || data || []).map((u: any) => ({
              id: u.id,
              name: u.name,
              email: u.email,
            }))
          )
        }
      } catch (err) {
        console.error("Error fetching org users:", err)
      }
    }
    fetchOrgUsers()
  }, [])

  // Build API path based on entity type
  const apiPath = useMemo(() => {
    switch (entityType) {
      case "reports":
        return `/api/reports/${entityId}/viewers`
      case "forms":
        return `/api/forms/${entityId}/viewers`
      case "reconciliations":
        return `/api/reconciliations/${entityId}/viewers`
      case "databases":
        return `/api/databases/${entityId}/viewers`
    }
  }, [entityType, entityId])

  // Save viewers (immediate, not debounced)
  const saveViewers = useCallback(
    async (newViewerIds: string[]) => {
      setSaving(true)
      try {
        const response = await fetch(apiPath, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ userIds: newViewerIds }),
        })
        if (response.ok) {
          const data = await response.json()
          onViewersChange(
            data.viewers.map((v: any) => ({
              userId: v.userId,
              name: v.name,
              email: v.email,
            }))
          )
        }
      } catch (err) {
        console.error("Error saving viewers:", err)
      } finally {
        setSaving(false)
      }
    },
    [apiPath, onViewersChange]
  )

  const addViewer = useCallback(
    (userId: string) => {
      const newViewerIds = [...viewers.map((v) => v.userId), userId]
      saveViewers(newViewerIds)
      setSearch("")
    },
    [viewers, saveViewers]
  )

  const removeViewer = useCallback(
    (userId: string) => {
      const newViewerIds = viewers.filter((v) => v.userId !== userId).map((v) => v.userId)
      saveViewers(newViewerIds)
    },
    [viewers, saveViewers]
  )

  // Filtered org users for dropdown (exclude existing viewers)
  const availableUsers = useMemo(() => {
    const viewerIds = new Set(viewers.map((v) => v.userId))
    return orgUsers
      .filter((u) => !viewerIds.has(u.id))
      .filter((u) => {
        if (!search) return true
        const s = search.toLowerCase()
        return u.name?.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
      })
  }, [orgUsers, viewers, search])

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm text-gray-700">Viewers</span>
          {viewers.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
              {viewers.length}
            </span>
          )}
        </div>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>

      <div className="p-3 space-y-2">
        {/* Add viewer dropdown */}
        <div className="relative">
          <Input
            placeholder="Search users to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            disabled={disabled || saving}
          />
          {search && availableUsers.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-auto">
              {availableUsers.slice(0, 8).map((user) => (
                <button
                  key={user.id}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => addViewer(user.id)}
                  disabled={disabled || saving}
                >
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {user.name || user.email}
                    </p>
                    {user.name && (
                      <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current viewers list */}
        {viewers.length > 0 ? (
          <div className="space-y-1">
            {viewers.map((viewer) => (
              <div
                key={viewer.userId}
                className="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {(viewer.name || viewer.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {viewer.name || viewer.email}
                    </p>
                    {viewer.name && (
                      <p className="text-[10px] text-gray-400 truncate">{viewer.email}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeViewer(viewer.userId)}
                  className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                  disabled={disabled || saving}
                  title="Remove viewer"
                >
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">
            No viewers. Only admins can access this.
          </p>
        )}
      </div>
    </div>
  )
}
