"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Database, Search, MoreHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DatabaseItem {
  id: string
  name: string
  description: string | null
  rowCount: number
  columnCount: number
  sourceType: string | null
  isReadOnly: boolean
  createdAt: string
  updatedAt: string
  createdBy: {
    name: string | null
    email: string
  }
}

export default function DatabasesPage() {
  const router = useRouter()
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchDatabases = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/databases", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setDatabases(data.databases || [])
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/databases"
      }
    } catch (error) {
      console.error("Error fetching databases:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDatabases()
  }, [fetchDatabases])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/databases/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (response.ok) {
        setDatabases(prev => prev.filter(db => db.id !== id))
      } else {
        const error = await response.json()
        alert(error.error || "Failed to delete database")
      }
    } catch (error) {
      console.error("Error deleting database:", error)
      alert("Failed to delete database")
    }
  }

  const filteredDatabases = databases.filter(db => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      db.name.toLowerCase().includes(query) ||
      (db.description?.toLowerCase().includes(query) ?? false)
    )
  })

  return (
    <div className="p-8">
      {/* Search + Action */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search databases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="ml-auto">
          <Link href="/dashboard/databases/new">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Database
            </Button>
          </Link>
        </div>
      </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : filteredDatabases.length === 0 ? (
          /* Empty state */
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Database className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {searchQuery ? "No databases found" : "No databases yet"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Create your first database to start managing structured data with schemas and Excel import/export."}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <Link href="/dashboard/databases/new">
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Database
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          /* Database table */
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Columns</th>
                  <th className="w-10 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDatabases.map((db) => (
                  <tr
                    key={db.id}
                    className="hover:bg-gray-50 cursor-pointer group"
                    onClick={() => router.push(`/dashboard/databases/${db.id}`)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[250px]">{db.name}</span>
                        {db.sourceType && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded flex-shrink-0">
                            Synced
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-500 truncate block max-w-[250px]">
                        {db.description || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">{db.rowCount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{db.columnCount}</td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDelete(db.id, db.name)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
