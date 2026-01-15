"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SubtaskRow } from "./subtask-row"

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
      // Handle owner update specially
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

  const completedCount = subtasks.filter(s => s.status === "DONE").length
  const totalCount = subtasks.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <h3 className="font-medium">Subtasks</h3>
          {totalCount > 0 && (
            <span className="text-sm text-gray-500">
              {completedCount}/{totalCount} completed
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="h-7"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Subtask
        </Button>
      </div>

      {/* Subtask List */}
      <div className="divide-y">
        {subtasks.map((subtask) => (
          <SubtaskRow
            key={subtask.id}
            subtask={subtask}
            teamMembers={teamMembers}
            onUpdate={handleUpdateSubtask}
            onDelete={handleDeleteSubtask}
            onViewAttachments={onViewAttachments}
          />
        ))}

        {/* Add new subtask row */}
        {isAdding && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-5 h-5 rounded border border-gray-300 shrink-0" />
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
              className="h-7 text-sm flex-1"
            />
            {addingLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            )}
          </div>
        )}

        {/* Empty state */}
        {subtasks.length === 0 && !isAdding && (
          <div className="px-4 py-8 text-center text-gray-500">
            <p className="text-sm">No subtasks yet</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="mt-1"
            >
              Add your first subtask
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
