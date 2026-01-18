"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  ExternalLink,
  Copy,
  Trash2,
  X
} from "lucide-react"
import { ColumnDefinition, DEFAULT_COLUMNS, JobRow, TeamMember } from "./types"
import { ColumnHeader } from "./column-header"
import { EditableCell } from "./editable-cell"

interface StatusGroup {
  status: string
  label: string
  color: string
  bgColor: string
  borderColor: string
  defaultExpanded: boolean
}

const STATUS_GROUPS: StatusGroup[] = [
  { status: "NOT_STARTED", label: "Not Started", color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-l-gray-400", defaultExpanded: true },
  { status: "IN_PROGRESS", label: "In Progress", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-l-blue-500", defaultExpanded: true },
  { status: "BLOCKED", label: "Blocked", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-l-red-500", defaultExpanded: true },
  { status: "COMPLETE", label: "Complete", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-l-green-500", defaultExpanded: false },
]

interface ConfigurableTableProps {
  jobs: JobRow[]
  teamMembers: TeamMember[]
  boardId?: string | null
  onJobUpdate: (jobId: string, updates: Record<string, any>) => Promise<void>
  onAddTask: () => void
  onDelete?: (jobIds: string[]) => Promise<void>
  onDuplicate?: (jobIds: string[]) => Promise<void>
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
  onAddTask,
  onDelete,
  onDuplicate,
}: ConfigurableTableProps) {
  const router = useRouter()
  const [columns, setColumns] = useState<ColumnDefinition[]>(DEFAULT_COLUMNS)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(STATUS_GROUPS.filter(g => g.defaultExpanded).map(g => g.status))
  )
  const [loadingColumnConfig, setLoadingColumnConfig] = useState(true)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)

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

  // Selection handlers
  const toggleJobSelection = useCallback((jobId: string) => {
    setSelectedJobs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(jobId)) {
        newSet.delete(jobId)
      } else {
        newSet.add(jobId)
      }
      return newSet
    })
  }, [])

  const toggleGroupSelection = useCallback((groupStatus: string) => {
    const groupJobs = jobsByStatus[groupStatus] || []
    const groupJobIds = groupJobs.map(j => j.id)
    
    setSelectedJobs(prev => {
      const allSelected = groupJobIds.every(id => prev.has(id))
      const newSet = new Set(prev)
      
      if (allSelected) {
        // Deselect all in group
        groupJobIds.forEach(id => newSet.delete(id))
      } else {
        // Select all in group
        groupJobIds.forEach(id => newSet.add(id))
      }
      return newSet
    })
  }, [jobsByStatus])

  const clearSelection = useCallback(() => {
    setSelectedJobs(new Set())
  }, [])

  const handleBulkDelete = useCallback(async () => {
    if (!onDelete || selectedJobs.size === 0) return
    setIsDeleting(true)
    try {
      await onDelete(Array.from(selectedJobs))
      setSelectedJobs(new Set())
    } finally {
      setIsDeleting(false)
    }
  }, [onDelete, selectedJobs])

  const handleBulkDuplicate = useCallback(async () => {
    if (!onDuplicate || selectedJobs.size === 0) return
    setIsDuplicating(true)
    try {
      await onDuplicate(Array.from(selectedJobs))
      setSelectedJobs(new Set())
    } finally {
      setIsDuplicating(false)
    }
  }, [onDuplicate, selectedJobs])

  // Check if all jobs in a group are selected
  const isGroupAllSelected = useCallback((groupStatus: string): boolean => {
    const groupJobs = jobsByStatus[groupStatus] || []
    if (groupJobs.length === 0) return false
    return groupJobs.every(j => selectedJobs.has(j.id))
  }, [jobsByStatus, selectedJobs])

  const isGroupPartiallySelected = useCallback((groupStatus: string): boolean => {
    const groupJobs = jobsByStatus[groupStatus] || []
    if (groupJobs.length === 0) return false
    const selectedCount = groupJobs.filter(j => selectedJobs.has(j.id)).length
    return selectedCount > 0 && selectedCount < groupJobs.length
  }, [jobsByStatus, selectedJobs])

  return (
    <div className="space-y-4 pb-20">
      {STATUS_GROUPS.map((group) => {
        const groupJobs = jobsByStatus[group.status] || []
        const isExpanded = expandedGroups.has(group.status)

        return (
          <div key={group.status} className={`rounded-lg overflow-hidden border-l-4 ${group.borderColor}`}>
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
                        {/* Select All Checkbox for Group */}
                        <th className="w-12 px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isGroupAllSelected(group.status)}
                            ref={(el) => {
                              if (el) el.indeterminate = isGroupPartiallySelected(group.status)
                            }}
                            onChange={() => toggleGroupSelection(group.status)}
                            className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                          />
                        </th>
                        <th className="w-10 px-2 py-2 text-center"></th>
                        {visibleColumns.map((column) => (
                          <th
                            key={column.id}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: column.width ? `${column.width}px` : "auto" }}
                          >
                            {column.label}
                          </th>
                        ))}
                        <th className="w-12 px-2 py-2">
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
                          className={`hover:bg-gray-50 transition-colors group ${selectedJobs.has(job.id) ? "bg-orange-50" : ""}`}
                        >
                          {/* Row Checkbox */}
                          <td className="w-12 px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedJobs.has(job.id)}
                              onChange={() => toggleJobSelection(job.id)}
                              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                            />
                          </td>
                          <td className="w-10 px-2 py-2 text-center">
                            <button
                              onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                              className="p-1.5 rounded hover:bg-blue-100 transition-colors text-gray-400 hover:text-blue-600"
                              title="Open Task page"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </td>
                          {visibleColumns.map((column) => (
                            <td
                              key={column.id}
                              className="px-3 py-2"
                            >
                              <EditableCell
                                column={column}
                                job={job}
                                teamMembers={teamMembers}
                                onUpdate={handleCellUpdate}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-2"></td>
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

      {/* Floating Action Bar when items selected */}
      {selectedJobs.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-2xl">
            {/* Selection count */}
            <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
              <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-sm font-medium">
                {selectedJobs.size}
              </div>
              <span className="text-sm font-medium">
                Task{selectedJobs.size !== 1 ? "s" : ""} selected
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {onDuplicate && (
                <button
                  onClick={handleBulkDuplicate}
                  disabled={isDuplicating}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-sm">Duplicate</span>
                </button>
              )}
              
              {onDelete && (
                <button
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm">Delete</span>
                </button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={clearSelection}
              className="ml-2 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
