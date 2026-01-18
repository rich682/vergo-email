"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  MoreHorizontal,
  Trash2,
  Copy,
  ExternalLink
} from "lucide-react"
import { ColumnDefinition, DEFAULT_COLUMNS, JobRow, TeamMember } from "./types"
import { ColumnHeader } from "./column-header"
import { EditableCell } from "./editable-cell"

interface StatusGroup {
  status: string
  label: string
  color: string
  bgColor: string
  defaultExpanded: boolean
}

const STATUS_GROUPS: StatusGroup[] = [
  { status: "NOT_STARTED", label: "Not Started", color: "text-gray-600", bgColor: "bg-gray-50", defaultExpanded: true },
  { status: "IN_PROGRESS", label: "In Progress", color: "text-blue-600", bgColor: "bg-blue-50", defaultExpanded: true },
  { status: "BLOCKED", label: "Blocked", color: "text-red-600", bgColor: "bg-red-50", defaultExpanded: true },
  { status: "COMPLETE", label: "Complete", color: "text-green-600", bgColor: "bg-green-50", defaultExpanded: false },
]

interface ConfigurableTableProps {
  jobs: JobRow[]
  teamMembers: TeamMember[]
  boardId?: string | null
  onJobUpdate: (jobId: string, updates: Record<string, any>) => Promise<void>
  onJobDelete: (jobId: string) => Promise<void>
  onJobDuplicate: (jobId: string) => Promise<void>
  onAddTask: () => void
}

// Map legacy statuses
const mapStatusForDisplay = (status: string): string => {
  switch (status) {
    case "ACTIVE": return "NOT_STARTED"
    case "WAITING": return "IN_PROGRESS"
    case "COMPLETED": return "COMPLETE"
    case "ARCHIVED": return "COMPLETE"
    default: return status
  }
}

export function ConfigurableTable({
  jobs,
  teamMembers,
  boardId,
  onJobUpdate,
  onJobDelete,
  onJobDuplicate,
  onAddTask,
}: ConfigurableTableProps) {
  const router = useRouter()
  const [columns, setColumns] = useState<ColumnDefinition[]>(DEFAULT_COLUMNS)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(STATUS_GROUPS.filter(g => g.defaultExpanded).map(g => g.status))
  )
  const [loadingColumnConfig, setLoadingColumnConfig] = useState(true)

  // Fetch column configuration on mount
  useEffect(() => {
    const fetchColumnConfig = async () => {
      try {
        const params = new URLSearchParams()
        if (boardId) params.set("boardId", boardId)
        
        const response = await fetch(`/api/jobs/column-config?${params.toString()}`, {
          credentials: "include"
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.columns && data.columns.length > 0) {
            setColumns(data.columns)
          }
        }
      } catch (error) {
        console.error("Error fetching column config:", error)
      } finally {
        setLoadingColumnConfig(false)
      }
    }
    
    fetchColumnConfig()
  }, [boardId])

  // Save column configuration when columns change
  const saveColumnConfig = useCallback(async (newColumns: ColumnDefinition[]) => {
    try {
      await fetch("/api/jobs/column-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ columns: newColumns, boardId })
      })
    } catch (error) {
      console.error("Error saving column config:", error)
    }
  }, [boardId])

  const handleColumnsChange = useCallback((newColumns: ColumnDefinition[]) => {
    setColumns(newColumns)
    saveColumnConfig(newColumns)
  }, [saveColumnConfig])

  // Handle cell updates with debounce
  const handleCellUpdate = useCallback(async (jobId: string, field: string, value: any) => {
    try {
      // Handle nested field updates (e.g., customFields.columnId)
      const updates: Record<string, any> = {}
      
      if (field.startsWith("customFields.")) {
        const customFieldKey = field.replace("customFields.", "")
        const job = jobs.find(j => j.id === jobId)
        updates.customFields = {
          ...(job?.customFields || {}),
          [customFieldKey]: value
        }
      } else {
        updates[field] = value
      }
      
      await onJobUpdate(jobId, updates)
    } catch (error) {
      console.error("Error updating job:", error)
    }
  }, [jobs, onJobUpdate])

  const toggleGroup = (status: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(status)) {
        newSet.delete(status)
      } else {
        newSet.add(status)
      }
      return newSet
    })
  }

  // Group jobs by status
  const jobsByStatus = useMemo(() => {
    return STATUS_GROUPS.reduce((acc, group) => {
      acc[group.status] = jobs.filter(j => mapStatusForDisplay(j.status) === group.status)
      return acc
    }, {} as Record<string, JobRow[]>)
  }, [jobs])

  // Filter visible columns and sort by order
  const visibleColumns = useMemo(() => {
    return columns
      .filter(col => col.visible)
      .sort((a, b) => a.order - b.order)
  }, [columns])

  const handleRowClick = (jobId: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button, input, select, [role="button"]')) {
      return
    }
    router.push(`/dashboard/jobs/${jobId}`)
  }

  return (
    <div className="space-y-4">
      {STATUS_GROUPS.map((group) => {
        const groupJobs = jobsByStatus[group.status] || []
        const isExpanded = expandedGroups.has(group.status)

        return (
          <div key={group.status} className="rounded-lg overflow-hidden">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.status)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 ${group.bgColor} hover:opacity-90 transition-opacity`}
            >
              {isExpanded ? (
                <ChevronDown className={`w-4 h-4 ${group.color}`} />
              ) : (
                <ChevronRight className={`w-4 h-4 ${group.color}`} />
              )}
              <span className={`font-medium ${group.color}`}>{group.label}</span>
              <span className="text-sm text-gray-500">({groupJobs.length})</span>
            </button>

            {/* Group Content */}
            {isExpanded && (
              <div className="border border-t-0 border-gray-200 bg-white">
                {groupJobs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-400 text-sm">
                    No tasks in this group
                  </div>
                ) : (
                  <table className="w-full">
                    {/* Table Header */}
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {visibleColumns.map((column) => (
                          <th
                            key={column.id}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: column.width ? `${column.width}px` : "auto" }}
                          >
                            {column.label}
                          </th>
                        ))}
                        <th className="w-16 px-3 py-2">
                          <ColumnHeader
                            columns={columns}
                            onColumnsChange={handleColumnsChange}
                          />
                        </th>
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-gray-100">
                      {groupJobs.map((job) => (
                        <tr
                          key={job.id}
                          onClick={(e) => handleRowClick(job.id, e)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          {visibleColumns.map((column) => (
                            <td
                              key={column.id}
                              className="px-3 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <EditableCell
                                column={column}
                                job={job}
                                teamMembers={teamMembers}
                                onUpdate={handleCellUpdate}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <JobRowActions
                              jobId={job.id}
                              onDelete={onJobDelete}
                              onDuplicate={onJobDuplicate}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Add Task Row */}
                <button
                  onClick={onAddTask}
                  className="w-full flex items-center gap-2 px-4 py-3 text-gray-500 hover:bg-gray-50 hover:text-gray-700 border-t border-gray-100"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Add task</span>
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Row actions dropdown component
function JobRowActions({
  jobId,
  onDelete,
  onDuplicate,
}: {
  jobId: string
  onDelete: (jobId: string) => Promise<void>
  onDuplicate: (jobId: string) => Promise<void>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="p-1.5 rounded hover:bg-gray-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/dashboard/jobs/${jobId}`)
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(jobId)
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm("Are you sure you want to delete this task?")) {
                  onDelete(jobId)
                }
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
