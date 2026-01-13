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
import { Plus, Briefcase, Calendar, Users, CheckCircle, Clock, Archive, User, UserCircle, X, Tag, ChevronDown, Filter } from "lucide-react"
import { formatDistanceToNow, format, differenceInDays } from "date-fns"
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
  status: string // Allow any status (custom statuses)
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

// Default status colors - custom statuses will get a default gray color
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  ACTIVE: { label: "Active", color: "bg-blue-100 text-blue-800", icon: Clock },
  WAITING: { label: "Waiting", color: "bg-amber-100 text-amber-800", icon: Clock },
  COMPLETED: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  ARCHIVED: { label: "Archived", color: "bg-gray-100 text-gray-600", icon: Archive }
}

// Get status display info, with fallback for custom statuses
const getStatusConfig = (status: string) => {
  if (STATUS_CONFIG[status]) {
    return STATUS_CONFIG[status]
  }
  // Custom status - use a default style
  return {
    label: status,
    color: "bg-purple-100 text-purple-800",
    icon: Clock
  }
}

export default function JobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([]) // Store all jobs to extract labels
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "my">("all")
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [isLabelDropdownOpen, setIsLabelDropdownOpen] = useState(false)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobTags, setNewJobTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState("")
  const [creating, setCreating] = useState(false)

  // Collect all unique tags from ALL jobs (not just filtered)
  const allTags = Array.from(
    new Set(
      allJobs.flatMap(job => job.labels?.tags || [])
    )
  ).sort()

  // Collect all unique statuses from ALL jobs (includes custom statuses)
  const allStatuses = Array.from(
    new Set(allJobs.map(job => job.status))
  ).sort((a, b) => {
    // Sort built-in statuses first, then custom
    const builtIn = ["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"]
    const aIdx = builtIn.indexOf(a)
    const bIdx = builtIn.indexOf(b)
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    if (aIdx !== -1) return -1
    if (bIdx !== -1) return 1
    return a.localeCompare(b)
  })

  // Fetch all jobs once to get all available labels
  const fetchAllJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs`, {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        setAllJobs(data.jobs || [])
      }
    } catch (error) {
      console.error("Error fetching all jobs:", error)
    }
  }, [])

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
    fetchAllJobs()
  }, [fetchAllJobs])

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
        setAllJobs(prev => [data.job, ...prev])
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
      const tag = newTagInput.trim()
      if (!newJobTags.includes(tag)) {
        setNewJobTags(prev => [...prev, tag])
      }
      setNewTagInput("")
    }
  }

  const handleRemoveNewTag = (tagToRemove: string) => {
    setNewJobTags(prev => prev.filter(t => t !== tagToRemove))
  }

  const handleToggleLabelFilter = (tag: string) => {
    if (tagFilter.includes(tag)) {
      setTagFilter(prev => prev.filter(t => t !== tag))
    } else {
      setTagFilter(prev => [...prev, tag])
    }
  }

  const handleRemoveTagFilter = (tagToRemove: string) => {
    setTagFilter(prev => prev.filter(t => t !== tagToRemove))
  }

  const clearAllFilters = () => {
    setStatusFilter("all")
    setOwnershipFilter("all")
    setTagFilter([])
  }

  const hasActiveFilters = statusFilter !== "all" || ownershipFilter !== "all" || tagFilter.length > 0

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
                    Press Enter to add each label (e.g., January, Client Request)
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
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Filter className="w-4 h-4 text-gray-400" />
        
        {/* Ownership Filter Dropdown */}
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

        {/* Status Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsStatusDropdownOpen(!isStatusDropdownOpen)
              setIsLabelDropdownOpen(false)
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter !== "all"
                ? "bg-gray-900 border-gray-900 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Clock className="w-4 h-4" />
            {statusFilter === "all" ? (
              <span>All statuses</span>
            ) : (
              <span>{getStatusConfig(statusFilter).label}</span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${isStatusDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Status Dropdown */}
          {isStatusDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] max-h-64 overflow-auto">
              <div className="py-1">
                <button
                  onClick={() => {
                    setStatusFilter("all")
                    setIsStatusDropdownOpen(false)
                  }}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    statusFilter === "all" ? "bg-gray-50 font-medium" : ""
                  }`}
                >
                  All statuses
                </button>
                <div className="border-t border-gray-100 my-1" />
                {/* Built-in statuses */}
                {["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].map(status => {
                  const config = getStatusConfig(status)
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        setStatusFilter(status)
                        setIsStatusDropdownOpen(false)
                      }}
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        statusFilter === status ? "bg-gray-50 font-medium" : ""
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${config.color.split(" ")[0]}`} />
                      {config.label}
                    </button>
                  )
                })}
                {/* Custom statuses (if any) */}
                {allStatuses.filter(s => !["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].includes(s)).length > 0 && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <div className="px-3 py-1 text-xs text-gray-400 uppercase tracking-wider">Custom</div>
                    {allStatuses
                      .filter(s => !["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].includes(s))
                      .map(status => {
                        const config = getStatusConfig(status)
                        return (
                          <button
                            key={status}
                            onClick={() => {
                              setStatusFilter(status)
                              setIsStatusDropdownOpen(false)
                            }}
                            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                              statusFilter === status ? "bg-gray-50 font-medium" : ""
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${config.color.split(" ")[0]}`} />
                            {config.label}
                          </button>
                        )
                      })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Label Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsLabelDropdownOpen(!isLabelDropdownOpen)
              setIsStatusDropdownOpen(false)
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              tagFilter.length > 0
                ? "bg-blue-50 border-blue-200 text-blue-800"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Tag className="w-4 h-4" />
            {tagFilter.length > 0 ? (
              <span>{tagFilter.length} label{tagFilter.length !== 1 ? "s" : ""}</span>
            ) : (
              <span>Labels</span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${isLabelDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Label Dropdown */}
          {isLabelDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[200px] max-h-64 overflow-auto">
              {allTags.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No labels created yet
                </div>
              ) : (
                <div className="py-1">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => handleToggleLabelFilter(tag)}
                      className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        tagFilter.includes(tag)
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300"
                      }`}>
                        {tagFilter.includes(tag) && (
                          <CheckCircle className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className="flex-1">{tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active filters display */}
        {(statusFilter !== "all" || tagFilter.length > 0) && (
          <div className="flex items-center gap-1 flex-wrap">
            {statusFilter !== "all" && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${getStatusConfig(statusFilter).color}`}>
                {getStatusConfig(statusFilter).label}
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
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
          </div>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Click outside to close dropdowns */}
      {(isLabelDropdownOpen || isStatusDropdownOpen) && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => {
            setIsLabelDropdownOpen(false)
            setIsStatusDropdownOpen(false)
          }}
        />
      )}

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
            const statusConfig = getStatusConfig(job.status)
            const jobTags = job.labels?.tags || []
            const dueDate = job.dueDate ? new Date(job.dueDate) : null
            const daysUntilDue = dueDate ? differenceInDays(dueDate, new Date()) : null
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0
            const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3
            
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
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.color}`}>
                          {statusConfig.label}
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
                        <span>
                          Updated {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {/* Deadline display (instead of progress) */}
                    {dueDate && (
                      <div className="flex flex-col items-end ml-4">
                        <div className={`text-sm font-medium ${
                          isOverdue ? "text-red-600" : isDueSoon ? "text-amber-600" : "text-gray-600"
                        }`}>
                          {isOverdue ? "Overdue" : isDueSoon ? `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}` : format(dueDate, "MMM d")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(dueDate, "yyyy")}
                        </div>
                      </div>
                    )}
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
