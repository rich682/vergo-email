"use client"

import { useState, useEffect, useCallback, KeyboardEvent } from "react"
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
import { Plus, Briefcase, Calendar, Users, CheckCircle, Clock, Archive, User, UserCircle, X, Tag } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"

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

interface JobLabels {
  tags?: string[]
  period?: string
  workType?: string
}

interface Job {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: "ACTIVE" | "WAITING" | "COMPLETED" | "ARCHIVED"
  dueDate: string | null
  labels: JobLabels | null
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
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "my">("all")
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobTags, setNewJobTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState("")
  const [creating, setCreating] = useState(false)

  // Collect all unique tags from jobs for autocomplete
  const allTags = Array.from(
    new Set(
      jobs.flatMap(job => job.labels?.tags || [])
    )
  ).sort()

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
      if (tagFilter.length > 0) {
        params.set("tags", tagFilter.join(","))
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
  }, [statusFilter, ownershipFilter, tagFilter])

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
          description: newJobDescription.trim() || undefined,
          tags: newJobTags.length > 0 ? newJobTags : undefined
        })
      })

      if (response.ok) {
        const data = await response.json()
        setJobs(prev => [data.job, ...prev])
        setNewJobName("")
        setNewJobDescription("")
        setNewJobTags([])
        setNewTagInput("")
        setIsCreateOpen(false)
        router.push(`/dashboard/jobs/${data.job.id}`)
      }
    } catch (error) {
      console.error("Error creating job:", error)
    } finally {
      setCreating(false)
    }
  }

  const handleAddNewTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newTagInput.trim()) {
      e.preventDefault()
      const tag = newTagInput.trim().toLowerCase()
      if (!newJobTags.includes(tag)) {
        setNewJobTags(prev => [...prev, tag])
      }
      setNewTagInput("")
    }
  }

  const handleRemoveNewTag = (tagToRemove: string) => {
    setNewJobTags(prev => prev.filter(t => t !== tagToRemove))
  }

  const handleAddTagFilter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().toLowerCase()
      if (!tagFilter.includes(tag)) {
        setTagFilter(prev => [...prev, tag])
      }
      setTagInput("")
    }
  }

  const handleRemoveTagFilter = (tagToRemove: string) => {
    setTagFilter(prev => prev.filter(t => t !== tagToRemove))
  }

  const handleSelectExistingTag = (tag: string) => {
    if (!tagFilter.includes(tag)) {
      setTagFilter(prev => [...prev, tag])
    }
    setTagInput("")
  }

  const clearAllFilters = () => {
    setStatusFilter("all")
    setOwnershipFilter("all")
    setTagFilter([])
  }

  const hasActiveFilters = statusFilter !== "all" || ownershipFilter !== "all" || tagFilter.length > 0

  const getProgressPercent = (job: Job) => {
    if (job.taskCount === 0) return 0
    return Math.round((job.respondedCount / job.taskCount) * 100)
  }

  // Filter suggestions based on input
  const tagSuggestions = tagInput.trim()
    ? allTags.filter(t => 
        t.toLowerCase().includes(tagInput.toLowerCase()) && 
        !tagFilter.includes(t)
      )
    : []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{UI_LABELS.jobsPageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {UI_LABELS.jobsPageSubtitle}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              {UI_LABELS.newJob}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{UI_LABELS.createJobModalTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="jobName">{UI_LABELS.jobNameLabel}</Label>
                <Input
                  id="jobName"
                  placeholder={UI_LABELS.jobNamePlaceholder}
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="jobDescription">{UI_LABELS.jobDescriptionLabel}</Label>
                <Input
                  id="jobDescription"
                  placeholder={UI_LABELS.jobDescriptionPlaceholder}
                  value={newJobDescription}
                  onChange={(e) => setNewJobDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="jobTags">Labels (optional)</Label>
                <div className="mt-1">
                  {/* Tags display */}
                  {newJobTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {newJobTags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveNewTag(tag)}
                            className="hover:text-blue-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <Input
                    id="jobTags"
                    placeholder="Type a label and press Enter"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={handleAddNewTag}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Press Enter to add each label (e.g., january, book-close)
                  </p>
                </div>
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
                  {creating ? "Creating..." : UI_LABELS.createJob}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Ownership Filter */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setOwnershipFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              ownershipFilter === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {UI_LABELS.allJobs}
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
            {UI_LABELS.myJobs}
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

        {/* Tag Filter */}
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-400" />
          <div className="relative">
            <div className="flex items-center gap-1 flex-wrap">
              {tagFilter.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTagFilter(tag)}
                    className="hover:text-blue-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <Input
                placeholder="Filter by label..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTagFilter}
                className="w-32 h-7 text-sm"
              />
            </div>
            {/* Tag suggestions dropdown */}
            {tagSuggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-40 overflow-auto">
                {tagSuggestions.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleSelectExistingTag(tag)}
                    className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Briefcase className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No {UI_LABELS.jobPlural.toLowerCase()} yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first {UI_LABELS.jobSingular.toLowerCase()} to start organizing client work
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              {UI_LABELS.createJob}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const StatusIcon = STATUS_CONFIG[job.status]?.icon || Clock
            const progressPercent = getProgressPercent(job)
            const jobTags = job.labels?.tags || []
            
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

                      {/* Tags display */}
                      {jobTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {jobTags.map(tag => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
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
