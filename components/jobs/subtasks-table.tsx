"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, Loader2, MoreHorizontal, Trash2, Copy, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"

interface TeamMember {
  id: string
  name: string | null
  email: string
}

interface Subtask {
  id: string
  title: string
  description: string | null
  status: "NOT_STARTED" | "IN_PROGRESS" | "STUCK" | "DONE"
  dueDate: string | null
  owner: TeamMember | null
  attachmentCount: number
}

interface SubtasksTableProps {
  jobId: string
  teamMembers: TeamMember[]
  onViewAttachments: (subtaskId: string) => void
}

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not Started", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "STUCK", label: "Blocked", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "DONE", label: "Complete", color: "bg-green-100 text-green-700 border-green-200" },
]

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0]?.[0]?.toUpperCase() || email[0]?.toUpperCase() || "?"
  }
  return email[0]?.toUpperCase() || "?"
}

// Individual subtask row - styled like a task
function SubtaskItem({
  subtask,
  teamMembers,
  onUpdate,
  onDelete,
  onDuplicate
}: {
  subtask: Subtask
  teamMembers: TeamMember[]
  onUpdate: (id: string, data: Partial<Subtask>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(subtask.title)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  
  const statusRef = useRef<HTMLDivElement>(null)
  const ownerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false)
      }
      if (ownerRef.current && !ownerRef.current.contains(e.target as Node)) {
        setOwnerMenuOpen(false)
      }
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleTitleBlur = async () => {
    if (title.trim() && title.trim() !== subtask.title) {
      setUpdating(true)
      await onUpdate(subtask.id, { title: title.trim() })
      setUpdating(false)
    }
    setIsEditing(false)
  }

  const handleStatusChange = async (status: string) => {
    setUpdating(true)
    setStatusMenuOpen(false)
    await onUpdate(subtask.id, { status: status as Subtask["status"] })
    setUpdating(false)
  }

  const handleOwnerChange = async (ownerId: string | null) => {
    setUpdating(true)
    setOwnerMenuOpen(false)
    await onUpdate(subtask.id, { owner: ownerId ? { id: ownerId } as any : null })
    setUpdating(false)
  }

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUpdating(true)
    const date = e.target.value ? new Date(e.target.value) : null
    await onUpdate(subtask.id, { dueDate: date ? date.toISOString() : null })
    setUpdating(false)
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === subtask.status) || STATUS_OPTIONS[0]

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 group ${updating ? 'opacity-50' : ''}`}>
      {/* Indent indicator */}
      <div className="w-4 border-l-2 border-gray-200 h-6 ml-2" />
      
      {/* Title */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleBlur()
              if (e.key === "Escape") {
                setTitle(subtask.title)
                setIsEditing(false)
              }
            }}
            autoFocus
            className="h-7 text-sm"
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            className={`text-sm cursor-pointer hover:text-blue-600 truncate block ${subtask.status === "DONE" ? "line-through text-gray-400" : "text-gray-900"}`}
          >
            {subtask.title}
          </span>
        )}
      </div>

      {/* Status Dropdown */}
      <div className="w-28 flex-shrink-0 relative" ref={statusRef}>
        <button
          onClick={() => setStatusMenuOpen(!statusMenuOpen)}
          className={`px-2 py-1 text-xs font-medium rounded-full border ${currentStatus.color} hover:opacity-80 transition-opacity`}
        >
          {currentStatus.label}
        </button>
        {statusMenuOpen && (
          <div className="absolute left-0 top-full mt-1 w-32 bg-white border rounded-lg shadow-lg z-20">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusChange(option.value)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${subtask.status === option.value ? "bg-gray-50 font-medium" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  option.value === "NOT_STARTED" ? "bg-gray-400" :
                  option.value === "IN_PROGRESS" ? "bg-blue-500" :
                  option.value === "STUCK" ? "bg-red-500" :
                  "bg-green-500"
                }`} />
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Owner Dropdown */}
      <div className="w-24 flex-shrink-0 relative" ref={ownerRef}>
        <button
          onClick={() => setOwnerMenuOpen(!ownerMenuOpen)}
          className="flex items-center gap-1"
        >
          {subtask.owner ? (
            <div 
              className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
              title={subtask.owner.name || subtask.owner.email}
            >
              {getInitials(subtask.owner.name, subtask.owner.email)}
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400">
              <Plus className="w-3 h-3" />
            </div>
          )}
        </button>
        {ownerMenuOpen && (
          <div className="absolute left-0 top-full mt-1 w-40 bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
            <button
              onClick={() => handleOwnerChange(null)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-gray-400"
            >
              Unassigned
            </button>
            {teamMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => handleOwnerChange(member.id)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${subtask.owner?.id === member.id ? "bg-gray-50 font-medium" : ""}`}
              >
                {member.name || member.email}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Due Date */}
      <div className="w-24 flex-shrink-0">
        <input
          type="date"
          value={subtask.dueDate ? format(new Date(subtask.dueDate), "yyyy-MM-dd") : ""}
          onChange={handleDateChange}
          className="px-2 py-1 text-xs border rounded w-full hover:bg-gray-50 text-gray-500"
        />
      </div>

      {/* Actions */}
      <div className="w-8 flex-shrink-0 relative" ref={actionsRef}>
        <button
          onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
        </button>
        {actionsMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-32 bg-white border rounded-lg shadow-lg z-20">
            <button
              onClick={() => {
                setActionsMenuOpen(false)
                onDuplicate(subtask.id)
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={() => {
                setActionsMenuOpen(false)
                // Enhanced confirmation with attachment warning
                const hasAttachments = subtask.attachmentCount > 0
                const message = hasAttachments
                  ? `Delete this subtask?\n\n⚠️ Warning: This subtask has ${subtask.attachmentCount} attachment${subtask.attachmentCount !== 1 ? 's' : ''} that will also be permanently deleted.`
                  : "Delete this subtask?"
                if (window.confirm(message)) {
                  onDelete(subtask.id)
                }
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function SubtasksTable({
  jobId,
  teamMembers,
  onViewAttachments
}: SubtasksTableProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [addingLoading, setAddingLoading] = useState(false)

  useEffect(() => {
    fetchSubtasks()
  }, [jobId])

  const fetchSubtasks = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/subtasks`)
      if (response.ok) {
        const data = await response.json()
        setSubtasks(data.subtasks || [])
      }
    } catch (error) {
      console.error("Error fetching subtasks:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSubtask = async () => {
    if (!newTitle.trim()) {
      setIsAdding(false)
      return
    }

    setAddingLoading(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() })
      })

      if (!response.ok) {
        throw new Error("Failed to create subtask")
      }

      const data = await response.json()
      setSubtasks([...subtasks, data.subtask])
      setNewTitle("")
      setIsAdding(false)
    } catch (error) {
      console.error("Failed to add subtask:", error)
    } finally {
      setAddingLoading(false)
    }
  }

  const handleUpdateSubtask = async (id: string, data: Partial<Subtask>) => {
    try {
      const updateData: any = { ...data }
      if ("owner" in data) {
        updateData.ownerId = data.owner?.id || null
        delete updateData.owner
      }

      const response = await fetch(`/api/subtasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        throw new Error("Failed to update subtask")
      }

      const result = await response.json()
      setSubtasks(subtasks.map(s => s.id === id ? result.subtask : s))
    } catch (error) {
      console.error("Failed to update subtask:", error)
      throw error
    }
  }

  const handleDeleteSubtask = async (id: string) => {
    try {
      const response = await fetch(`/api/subtasks/${id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        throw new Error("Failed to delete subtask")
      }

      setSubtasks(subtasks.filter(s => s.id !== id))
    } catch (error) {
      console.error("Failed to delete subtask:", error)
      throw error
    }
  }

  const handleDuplicateSubtask = async (id: string) => {
    const subtask = subtasks.find(s => s.id === id)
    if (!subtask) return

    try {
      const response = await fetch(`/api/jobs/${jobId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${subtask.title} (Copy)`,
          description: subtask.description,
          ownerId: subtask.owner?.id,
          dueDate: subtask.dueDate
        })
      })

      if (!response.ok) {
        throw new Error("Failed to duplicate subtask")
      }

      const data = await response.json()
      setSubtasks([...subtasks, data.subtask])
    } catch (error) {
      console.error("Failed to duplicate subtask:", error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div>
      {/* Subtask rows - styled like nested tasks */}
      {subtasks.map((subtask) => (
        <SubtaskItem
          key={subtask.id}
          subtask={subtask}
          teamMembers={teamMembers}
          onUpdate={handleUpdateSubtask}
          onDelete={handleDeleteSubtask}
          onDuplicate={handleDuplicateSubtask}
        />
      ))}

      {/* Add new subtask row */}
      {isAdding ? (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="w-4 border-l-2 border-gray-200 h-6 ml-2" />
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onBlur={handleAddSubtask}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSubtask()
              if (e.key === "Escape") {
                setNewTitle("")
                setIsAdding(false)
              }
            }}
            placeholder="Enter subtask title..."
            autoFocus
            disabled={addingLoading}
            className="h-8 text-sm flex-1"
          />
          {addingLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-3 px-4 py-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 w-full text-left"
        >
          <div className="w-4 border-l-2 border-dashed border-gray-200 h-4 ml-2" />
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add subtask</span>
        </button>
      )}
    </div>
  )
}
