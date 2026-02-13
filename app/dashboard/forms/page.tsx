"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, ClipboardList, Search, MoreHorizontal, Trash2, Database, Clock, Loader2, ExternalLink, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { format } from "date-fns"
import type { FormField } from "@/lib/types/form"
import { usePermissions } from "@/components/permissions-context"

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

interface FormTaskSummary {
  taskInstanceId: string
  formDefinitionId: string
  taskName: string
  formName: string
  total: number
  submitted: number
  pending: number
  expired: number
  latestSentAt: string | null
  taskInstance: {
    id: string
    name: string
    board: { id: string; name: string } | null
  } | null
}

export default function FormsPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const canManageForms = can("forms:manage")

  // Section 1: Form definitions state
  const [forms, setForms] = useState<FormItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // Section 2: Form responses state
  const [formTasks, setFormTasks] = useState<FormTaskSummary[]>([])
  const [formTasksLoading, setFormTasksLoading] = useState(true)

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

  useEffect(() => {
    const fetchFormTasks = async () => {
      try {
        const res = await fetch("/api/form-requests/tasks", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setFormTasks(data.tasks || [])
        }
      } catch (err) {
        console.error("Failed to load form task summaries:", err)
      } finally {
        setFormTasksLoading(false)
      }
    }
    fetchFormTasks()
  }, [])

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
    <div className="p-8 space-y-8">
      {/* ============================================ */}
      {/* SECTION 1: Form Builder (Admin Only) */}
      {/* ============================================ */}
      {canManageForms && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Form Builder</h2>
              <p className="text-sm text-gray-500">Create and manage form templates for data collection</p>
            </div>
            <Link href="/dashboard/forms/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Form
              </Button>
            </Link>
          </div>

          {/* Search */}
          <div className="mb-4">
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
            <div className="flex items-center justify-center py-12 bg-white rounded-lg border border-gray-200">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : filteredForms.length === 0 ? (
            /* Empty state */
            <div className="text-center py-10 bg-white rounded-lg border border-gray-200">
              <ClipboardList className="mx-auto h-10 w-10 text-gray-400" />
              <h3 className="mt-3 text-base font-medium text-gray-900">
                {searchQuery ? "No forms found" : "No forms yet"}
              </h3>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                {searchQuery
                  ? "Try adjusting your search terms"
                  : "Create your first form to start collecting structured data from your team members."}
              </p>
              {!searchQuery && (
                <div className="mt-4">
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
                        <span className="text-sm font-medium text-gray-900 truncate block max-w-[250px]">
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
        </section>
      )}

      {/* ============================================ */}
      {/* SECTION 2: Form Responses */}
      {/* ============================================ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Form Responses</h2>
            <p className="text-sm text-gray-500">Track form submissions across tasks</p>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Form</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pending</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date Sent</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Board</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {formTasksLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mx-auto" />
                  </td>
                </tr>
              ) : formTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Clock className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-2 text-sm text-gray-500">No form responses yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Send form requests from task pages to start collecting data
                    </p>
                  </td>
                </tr>
              ) : (
                formTasks.map((item) => {
                  const pct = item.total > 0 ? Math.round((item.submitted / item.total) * 100) : 0
                  return (
                    <tr
                      key={`${item.taskInstanceId}-${item.formDefinitionId}`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/dashboard/jobs/${item.taskInstanceId}`)}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900">
                            {item.formName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/dashboard/jobs/${item.taskInstanceId}`}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            {item.taskName}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 whitespace-nowrap">
                            {item.submitted}/{item.total}
                          </span>
                          {pct === 100 && (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {item.pending > 0 ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                            {item.pending} pending
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {item.latestSentAt ? format(new Date(item.latestSentAt), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {item.taskInstance?.board ? (
                          item.taskInstance.board.name
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
