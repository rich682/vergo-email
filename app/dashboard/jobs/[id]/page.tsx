"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Edit2, Save, X, Trash2, Calendar, Users, CheckCircle, Clock, Archive, Mail } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"

interface Job {
  id: string
  name: string
  description: string | null
  status: "ACTIVE" | "WAITING" | "COMPLETED" | "ARCHIVED"
  dueDate: string | null
  labels: string[] | null
  createdAt: string
  updatedAt: string
  client?: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
  } | null
  taskCount: number
  respondedCount: number
  completedCount: number
}

const STATUS_CONFIG = {
  ACTIVE: { label: "Active", color: "bg-blue-100 text-blue-800" },
  WAITING: { label: "Waiting", color: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Completed", color: "bg-green-100 text-green-800" },
  ARCHIVED: { label: "Archived", color: "bg-gray-100 text-gray-600" }
}

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.id as string

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editStatus, setEditStatus] = useState<Job["status"]>("ACTIVE")
  const [editDueDate, setEditDueDate] = useState("")

  const fetchJob = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/jobs/${jobId}`, {
        credentials: "include"
      })

      if (response.ok) {
        const data = await response.json()
        setJob(data.job)
        // Initialize edit form
        setEditName(data.job.name)
        setEditDescription(data.job.description || "")
        setEditStatus(data.job.status)
        setEditDueDate(data.job.dueDate ? data.job.dueDate.split("T")[0] : "")
      } else if (response.status === 404) {
        router.push("/dashboard/jobs")
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/jobs"
      }
    } catch (error) {
      console.error("Error fetching job:", error)
    } finally {
      setLoading(false)
    }
  }, [jobId, router])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  const handleSave = async () => {
    if (!editName.trim()) return

    setSaving(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          status: editStatus,
          dueDate: editDueDate || null
        })
      })

      if (response.ok) {
        const data = await response.json()
        setJob(data.job)
        setEditing(false)
      }
    } catch (error) {
      console.error("Error updating job:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to archive this job?")) return

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        credentials: "include"
      })

      if (response.ok) {
        router.push("/dashboard/jobs")
      }
    } catch (error) {
      console.error("Error deleting job:", error)
    }
  }

  const cancelEdit = () => {
    if (job) {
      setEditName(job.name)
      setEditDescription(job.description || "")
      setEditStatus(job.status)
      setEditDueDate(job.dueDate ? job.dueDate.split("T")[0] : "")
    }
    setEditing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-gray-500">Job not found</p>
      </div>
    )
  }

  const progressPercent = job.taskCount > 0 
    ? Math.round((job.respondedCount / job.taskCount) * 100) 
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/jobs")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          {editing ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="editName">Job Name</Label>
                <Input
                  id="editName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 max-w-md"
                />
              </div>
              <div>
                <Label htmlFor="editDescription">Description</Label>
                <Input
                  id="editDescription"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1 max-w-md"
                />
              </div>
              <div className="flex gap-4">
                <div>
                  <Label htmlFor="editStatus">Status</Label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Job["status"])}>
                    <SelectTrigger className="w-40 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="WAITING">Waiting</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="editDueDate">Due Date</Label>
                  <Input
                    id="editDueDate"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="mt-1 w-40"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={cancelEdit}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_CONFIG[job.status]?.color}`}>
                  {STATUS_CONFIG[job.status]?.label}
                </span>
              </div>
              {job.description && (
                <p className="text-gray-500 mb-2">{job.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {job.client && (
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {job.client.firstName} {job.client.lastName || ""}
                  </span>
                )}
                {job.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Due {format(new Date(job.dueDate), "MMM d, yyyy")}
                  </span>
                )}
                <span>
                  Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                </span>
              </div>
            </>
          )}
        </div>

        {!editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{job.taskCount}</div>
                <div className="text-sm text-gray-500">Total Requests</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{job.respondedCount}</div>
                <div className="text-sm text-gray-500">Responded</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{job.completedCount}</div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {job.taskCount > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {progressPercent}%
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {job.respondedCount} of {job.taskCount} recipients have responded
            </p>
          </CardContent>
        </Card>
      )}

      {/* Placeholder for child tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {job.taskCount === 0 ? (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No requests in this job yet</p>
              <p className="text-sm text-gray-400">
                Requests will appear here when you create them and associate them with this job
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {job.taskCount} request{job.taskCount !== 1 ? "s" : ""} associated with this job
              </p>
              <p className="text-sm text-gray-400 mt-2">
                View requests in the Requests tab to see details
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
