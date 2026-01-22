"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { RefreshCw, Database, ArrowRight, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { TaskDataTable, TaskDataRow, UploadDataModal } from "@/components/datasets"

export default function DataPage() {
  const [tasks, setTasks] = useState<TaskDataRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskDataRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/data/tasks", { credentials: "include" })
      if (!response.ok) {
        throw new Error("Failed to fetch tasks")
      }
      const data = await response.json()
      setTasks(data.tasks || [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch tasks"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleUploadData = (task: TaskDataRow) => {
    setSelectedTask(task)
    setUploadModalOpen(true)
  }

  const handleDownloadTemplate = async (task: TaskDataRow) => {
    if (!task.datasetTemplate?.id) return

    try {
      const response = await fetch(`/api/datasets/${task.datasetTemplate.id}/template.csv`, {
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to download template")
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${task.datasetTemplate.name}-template.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error("Download failed:", err)
    }
  }

  const handleDeleteData = (task: TaskDataRow) => {
    setSelectedTask(task)
    setDeleteModalOpen(true)
  }

  const confirmDeleteData = async () => {
    if (!selectedTask?.datasetTemplate?.latestSnapshot?.id) return

    setDeleting(true)
    try {
      const response = await fetch(
        `/api/datasets/${selectedTask.datasetTemplate.id}/snapshots/${selectedTask.datasetTemplate.latestSnapshot.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )
      if (!response.ok) {
        throw new Error("Failed to delete data")
      }
      setDeleteModalOpen(false)
      setSelectedTask(null)
      fetchTasks()
    } catch (err) {
      console.error("Delete failed:", err)
    } finally {
      setDeleting(false)
    }
  }

  if (loading && tasks.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage data schemas and uploads for your tasks
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchTasks}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Task List or Empty State */}
      {tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <TaskDataTable
          tasks={tasks}
          onUploadData={handleUploadData}
          onDownloadTemplate={handleDownloadTemplate}
          onDeleteData={handleDeleteData}
        />
      )}

      {/* Upload Data Modal */}
      {selectedTask?.datasetTemplate && (
        <UploadDataModal
          open={uploadModalOpen}
          onOpenChange={setUploadModalOpen}
          datasetId={selectedTask.datasetTemplate.id}
          schema={selectedTask.datasetTemplate.schema}
          identityKey={selectedTask.datasetTemplate.identityKey}
          onUploaded={() => {
            setUploadModalOpen(false)
            setSelectedTask(null)
            fetchTasks()
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Data
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the uploaded data for{" "}
              <strong>{selectedTask?.name}</strong>? This will remove the latest
              snapshot ({selectedTask?.datasetTemplate?.latestSnapshot?.rowCount?.toLocaleString()} rows).
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteData}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
      <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No tasks have data enabled yet
      </h3>
      <p className="text-gray-500 mb-6 max-w-md mx-auto">
        Enable data from a task's Data tab to start managing schemas and uploads here.
      </p>
      <Button asChild>
        <Link href="/dashboard/jobs">
          Go to Tasks
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
    </div>
  )
}
