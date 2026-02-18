"use client"

import { useState, useEffect } from "react"
import { X, Database, Search, Loader2, AlertCircle } from "lucide-react"

interface DatabaseItem {
  id: string
  name: string
  description: string | null
  rowCount: number
  sourceType: string | null
}

interface DatabaseSelectDialogProps {
  onClose: () => void
  onConfirm: (databaseIds: string[]) => void
  loading?: boolean
}

export function DatabaseSelectDialog({ onClose, onConfirm, loading: externalLoading }: DatabaseSelectDialogProps) {
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const res = await fetch("/api/databases", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setDatabases(data.databases || [])
        }
      } catch (error) {
        console.error("Error fetching databases:", error)
      } finally {
        setFetching(false)
      }
    }
    fetchDatabases()
  }, [])

  const filtered = databases.filter(
    (db) =>
      db.name.toLowerCase().includes(search.toLowerCase()) ||
      (db.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleConfirm = () => {
    if (selected.size === 0) return
    onConfirm(Array.from(selected))
  }

  const isLoading = externalLoading || fetching

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Select Databases</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Choose which databases to query in this chat
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search databases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Database List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                {databases.length === 0
                  ? "No databases found. Create a database first."
                  : "No databases match your search."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((db) => (
                <label
                  key={db.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected.has(db.id)
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(db.id)}
                    onChange={() => toggleSelect(db.id)}
                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {db.name}
                      </span>
                      {db.sourceType && (
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          synced
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {db.rowCount.toLocaleString()} rows
                      </span>
                      {db.description && (
                        <>
                          <span className="text-xs text-gray-300">&middot;</span>
                          <span className="text-xs text-gray-500 truncate">
                            {db.description}
                          </span>
                        </>
                      )}
                    </div>
                    {db.rowCount === 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                        <AlertCircle className="w-3 h-3" />
                        No data — import data before querying
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0 || isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {externalLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Creating...
                </div>
              ) : (
                "Start Chat"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
