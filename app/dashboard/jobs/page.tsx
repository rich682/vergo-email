"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Briefcase, Calendar, Users, CheckCircle, Clock, Archive, User, UserCircle } from "lucide-react"
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
  user: {
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

const STATUS_CONFIG = {
  ACTIVE: { label: "Active", color: "bg-blue-100 text-blue-800", icon: Clock },
  WAITING: { label: "Waiting", color: "bg-amber-100 text-amber-800", icon: Clock },
  COMPLETED: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  ARCHIVED: { label: "Archived", color: "bg-gray-100 text-gray-600", icon: Archive }
}

export default function JobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "my">("all")  // "My Jobs" vs "All Jobs"
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [creating, setCreating] = useState(false)

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }
      if (ownershipFilter === "my") {
        params.set("myJobs", "true")
      }
      
      const response = await fetch(`/api/jobs?${params.toString()}`, {
        credentials: "include"
      })

      if (response.ok) {
        const data = await response.json()
        setJobs(data.jobs || [])
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/jobs"
      }
    } catch (error) {
      console.error("Error fetching jobs:", error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, ownershipFilter])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const handleCreateJob = async () => {
    if (!newJobName.trim()) return

    setCreating(true)
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newJobName.trim(),
          description: newJobDescription.trim() || undefined
        })
      })

      if (response.ok) {
        const data = await response.json()
        setJobs(prev => [data.job, ...prev])
        setNewJobName("")
        setNewJobDescription("")
        setIsCreateOpen(false)
        // Navigate to the new job
        router.push(`/dashboard/jobs/${data.job.id}`)
      }
    } catch (error) {
      console.error("Error creating job:", error)
    } finally {
      setCreating(false)
    }
  }

  const getProgressPercent = (job: Job) => {
    if (job.taskCount === 0) return 0
    return Math.round((job.respondedCount / job.taskCount) * 100)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your client work and track progress across requests
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Job</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="jobName">Job Name</Label>
                <Input
                  id="jobName"
                  placeholder="e.g., Tax Planning - Year End 2024"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="jobDescription">Description (optional)</Label>
                <Input
                  id="jobDescription"
                  placeholder="Brief description of the work"
                  value={newJobDescription}
                  onChange={(e) => setNewJobDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateJob}
                  disabled={!newJobName.trim() || creating}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {creating ? "Creating..." : "Create Job"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Ownership Filter - My Jobs vs All Jobs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setOwnershipFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              ownershipFilter === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            All Jobs
          </button>
          <button
            onClick={() => setOwnershipFilter("my")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
              ownershipFilter === "my"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <UserCircle className="w-3.5 h-3.5" />
            My Jobs
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {["all", "ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                statusFilter === status
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {status === "all" ? "All Status" : STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label || status}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Briefcase className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No jobs yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first job to start organizing client work
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const StatusIcon = STATUS_CONFIG[job.status]?.icon || Clock
            const progressPercent = getProgressPercent(job)
            
            return (
              <Card
                key={job.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 truncate">
                          {job.name}
                        </h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_CONFIG[job.status]?.color}`}>
                          {STATUS_CONFIG[job.status]?.label}
                        </span>
                      </div>
                      
                      {job.description && (
                        <p className="text-sm text-gray-500 truncate mb-2">
                          {job.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {/* Owner */}
                        <span className="flex items-center gap-1" title={`Owner: ${job.owner.email}`}>
                          <User className="w-3 h-3" />
                          {job.owner.name || job.owner.email.split("@")[0]}
                        </span>
                        {/* Collaborators count */}
                        {job.collaborators && job.collaborators.length > 0 && (
                          <span className="flex items-center gap-1" title={`${job.collaborators.length} collaborator(s)`}>
                            <Users className="w-3 h-3" />
                            +{job.collaborators.length}
                          </span>
                        )}
                        {job.client && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {job.client.firstName} {job.client.lastName || ""}
                          </span>
                        )}
                        {job.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Due {format(new Date(job.dueDate), "MMM d, yyyy")}
                          </span>
                        )}
                        <span>
                          Updated {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {/* Progress indicator */}
                    <div className="flex flex-col items-end ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {job.respondedCount} / {job.taskCount}
                      </div>
                      <div className="text-xs text-gray-500 mb-1">responded</div>
                      {job.taskCount > 0 && (
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
