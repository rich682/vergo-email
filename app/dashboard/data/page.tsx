"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Database, ArrowRight } from "lucide-react"
import Link from "next/link"
import { TaskDataTable, TaskDataRow, CreateDatasetModal, UploadDataModal } from "@/components/datasets"

export default function DataPage() {
  const [tasks, setTasks] = useState<TaskDataRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskDataRow | null>(null)

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

  const handleCreateSchema = (task: TaskDataRow) => {
    setSelectedTask(task)
    setCreateModalOpen(true)
  }

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
          onCreateSchema={handleCreateSchema}
          onUploadData={handleUploadData}
          onDownloadTemplate={handleDownloadTemplate}
        />
      )}

      {/* Create Schema Modal */}
      <CreateDatasetModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        lineageId={selectedTask?.id}
        taskName={selectedTask?.name}
        onCreated={() => {
          setCreateModalOpen(false)
          setSelectedTask(null)
          fetchTasks()
        }}
      />

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
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
      <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No tasks available for data management
      </h3>
      <p className="text-gray-500 mb-6 max-w-md mx-auto">
        Data schemas are created in relation to eligible tasks.
        Create a variance or reconciliation task to begin managing period-based data.
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
