"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  ArrowLeft, Edit2, Save, X, Trash2, Calendar, Users, CheckCircle, 
  Clock, Archive, Mail, User, UserPlus, MessageSquare, Send
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"

interface JobOwner {
  id: string
  name: string | null
  email: string
}

interface JobCollaborator {
  id: string
  userId: string
  role: string
  addedAt: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface JobComment {
  id: string
  jobId: string
  authorId: string
  content: string
  mentions: string[] | null
  createdAt: string
  author: {
    id: string
    name: string | null
    email: string
  }
}

interface Job {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: "ACTIVE" | "WAITING" | "COMPLETED" | "ARCHIVED"
  dueDate: string | null
  labels: string[] | null
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: JobCollaborator[]
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

interface Permissions {
  canEdit: boolean
  canManageCollaborators: boolean
  isOwner: boolean
  isAdmin: boolean
}

interface OrgUser {
  id: string
  name: string | null
  email: string
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
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Comments state
  const [comments, setComments] = useState<JobComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // Collaborator management
  const [isAddCollaboratorOpen, setIsAddCollaboratorOpen] = useState(false)
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [addingCollaborator, setAddingCollaborator] = useState(false)

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
        setPermissions(data.permissions)
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

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments`, {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
      }
    } catch (error) {
      console.error("Error fetching comments:", error)
    }
  }, [jobId])

  useEffect(() => {
    fetchJob()
    fetchComments()
  }, [fetchJob, fetchComments])

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

  const handleAddComment = async () => {
    if (!newComment.trim()) return

    setSubmittingComment(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newComment.trim() })
      })

      if (response.ok) {
        const data = await response.json()
        setComments(prev => [data.comment, ...prev])
        setNewComment("")
      }
    } catch (error) {
      console.error("Error adding comment:", error)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments?commentId=${commentId}`, {
        method: "DELETE",
        credentials: "include"
      })

      if (response.ok) {
        setComments(prev => prev.filter(c => c.id !== commentId))
      }
    } catch (error) {
      console.error("Error deleting comment:", error)
    }
  }

  const fetchOrgUsers = async () => {
    try {
      const response = await fetch("/api/user", {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        // For now, we'll use a simplified approach - in production you'd have a proper users endpoint
        setOrgUsers([])
      }
    } catch (error) {
      console.error("Error fetching users:", error)
    }
  }

  const handleAddCollaborator = async () => {
    if (!selectedUserId) return

    setAddingCollaborator(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: selectedUserId })
      })

      if (response.ok) {
        await fetchJob()
        setIsAddCollaboratorOpen(false)
        setSelectedUserId("")
      }
    } catch (error) {
      console.error("Error adding collaborator:", error)
    } finally {
      setAddingCollaborator(false)
    }
  }

  const handleRemoveCollaborator = async (userId: string) => {
    if (!confirm("Remove this collaborator?")) return

    try {
      const response = await fetch(`/api/jobs/${jobId}/collaborators?userId=${userId}`, {
        method: "DELETE",
        credentials: "include"
      })

      if (response.ok) {
        await fetchJob()
      }
    } catch (error) {
      console.error("Error removing collaborator:", error)
    }
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/jobs")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {editing ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="editName">Job Name</Label>
                        <Input
                          id="editName"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="editDescription">Description</Label>
                        <Input
                          id="editDescription"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Optional description"
                          className="mt-1"
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
                        <p className="text-gray-500 mb-3">{job.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
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

                {!editing && permissions?.canEdit && (
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
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
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
            <Card>
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

          {/* Comments / Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Comments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Add Comment */}
              <div className="flex gap-2 mb-4">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="bg-green-600 hover:bg-green-700 self-end"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {/* Comments List */}
              {comments.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No comments yet. Add a comment to start the conversation.
                </p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-900">
                            {comment.author.name || comment.author.email.split("@")[0]}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                      {permissions?.isOwner || permissions?.isAdmin ? (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-gray-400 hover:text-red-500 self-start"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Requests Placeholder */}
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Owner Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Owner</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {job.owner.name || job.owner.email.split("@")[0]}
                  </div>
                  <div className="text-sm text-gray-500">{job.owner.email}</div>
                </div>
              </div>
              {permissions?.isOwner && (
                <p className="text-xs text-green-600 mt-2">You own this job</p>
              )}
            </CardContent>
          </Card>

          {/* Collaborators Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-700">Collaborators</CardTitle>
                {permissions?.canManageCollaborators && (
                  <Dialog open={isAddCollaboratorOpen} onOpenChange={setIsAddCollaboratorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Collaborator</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <Label>User Email</Label>
                          <Input
                            placeholder="Enter user email or ID"
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter the user ID of the team member to add
                          </p>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setIsAddCollaboratorOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAddCollaborator}
                            disabled={!selectedUserId || addingCollaborator}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {addingCollaborator ? "Adding..." : "Add"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(!job.collaborators || job.collaborators.length === 0) ? (
                <p className="text-sm text-gray-500">No collaborators yet</p>
              ) : (
                <div className="space-y-3">
                  {job.collaborators.map((collab) => (
                    <div key={collab.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {collab.user.name || collab.user.email.split("@")[0]}
                          </div>
                          <div className="text-xs text-gray-500">{collab.role}</div>
                        </div>
                      </div>
                      {permissions?.canManageCollaborators && (
                        <button
                          onClick={() => handleRemoveCollaborator(collab.userId)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Labels Card */}
          {job.labels && job.labels.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700">Labels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {job.labels.map((label, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
