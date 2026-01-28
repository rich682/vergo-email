"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Database, Search, MoreHorizontal, Trash2, FileSpreadsheet } from "lucide-react"
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Databases</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your structured data with schemas and Excel import/export
              </p>
            </div>
            <Link href="/dashboard/databases/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Database
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search databases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
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
          /* Database grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDatabases.map((db) => (
              <div
                key={db.id}
                className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group"
              >
                <Link href={`/dashboard/databases/${db.id}`} className="block p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-50 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                          {db.name}
                        </h3>
                        {db.description && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                            {db.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
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
                          onClick={(e) => {
                            e.preventDefault()
                            handleDelete(db.id, db.name)
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                    <span>{db.rowCount.toLocaleString()} rows</span>
                    <span>{db.columnCount} columns</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
