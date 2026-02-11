"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, ClipboardList, Search, MoreHorizontal, Trash2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FormField } from "@/lib/types/form"

// Helper to safely render any value as a string (prevents React error #438)
function safeString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return '[object]' }
  }
  return String(value)
}

interface FormItem {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  database: {
    id: string
    name: string
  } | null
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    name: string | null
    email: string
  }
  _count: {
    formRequests: number
  }
}

export default function FormsPage() {
  const router = useRouter()
  const [forms, setForms] = useState<FormItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchForms = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/forms", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        // Explicitly extract only needed fields - don't spread to avoid unknown properties
        const forms = (data.forms || []).map((form: any) => {
          // Safely parse fields
          let fields = form.fields || []
          if (typeof fields === 'string') {
            try { fields = JSON.parse(fields) } catch { fields = [] }
          }
          
          return {
            id: String(form.id || ''),
            name: String(form.name || ''),
            description: form.description ? String(form.description) : null,
            fields: Array.isArray(fields) ? fields : [],
            database: form.database ? {
              id: String(form.database.id || ''),
              name: String(form.database.name || ''),
            } : null,
            _count: {
              formRequests: typeof form._count?.formRequests === 'number' ? form._count.formRequests : 0,
            },
            createdAt: form.createdAt,
            updatedAt: form.updatedAt,
          }
        })
        setForms(forms)
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/forms"
      }
    } catch (error) {
      console.error("Error fetching forms:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchForms()
  }, [fetchForms])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/forms/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (response.ok) {
        setForms(prev => prev.filter(form => form.id !== id))
      } else {
        const error = await response.json()
        alert(error.error || "Failed to delete form")
      }
    } catch (error) {
      console.error("Error deleting form:", error)
      alert("Failed to delete form")
    }
  }

  const filteredForms = forms.filter(form => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      form.name.toLowerCase().includes(query) ||
      (form.description?.toLowerCase().includes(query) ?? false)
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Forms</h1>
              <p className="mt-1 text-sm text-gray-500">
                Create forms to collect structured data from your team
              </p>
            </div>
            <Link href="/dashboard/forms/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Form
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
              placeholder="Search forms..."
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
        ) : filteredForms.length === 0 ? (
          /* Empty state */
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {searchQuery ? "No forms found" : "No forms yet"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Create your first form to start collecting structured data from your team members."}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <Link href="/dashboard/forms/new">
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Form
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          /* Form table */
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fields</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responses</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Database</th>
                  <th className="w-10 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredForms.map((form) => (
                  <tr
                    key={form.id}
                    className="hover:bg-gray-50 cursor-pointer group"
                    onClick={() => router.push(`/dashboard/forms/${form.id}`)}
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium text-gray-900 truncate block max-w-[250px]">
                        {safeString(form.name)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-500 truncate block max-w-[250px]">
                        {form.description ? safeString(form.description) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {Array.isArray(form.fields) ? form.fields.length : 0}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {typeof form._count?.formRequests === 'number' ? form._count.formRequests : 0}
                    </td>
                    <td className="px-4 py-2">
                      {form.database ? (
                        <span className="text-sm text-gray-700 flex items-center gap-1">
                          <Database className="w-3 h-3 text-gray-400" />
                          {safeString(form.database.name)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
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
                            onClick={() => handleDelete(form.id, safeString(form.name))}
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
    </div>
  )
}
