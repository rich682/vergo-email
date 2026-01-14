"use client"

import { useState, useEffect, useCallback, KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Briefcase, UserCircle, X, Clock, Tag, Filter } from "lucide-react"
import { formatDistanceToNow, format, differenceInDays } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"

// Design system components
import { Chip } from "@/components/ui/chip"
import { EmptyState } from "@/components/ui/empty-state"

// ============================================
// Types
// ============================================

interface JobOwner {
  id: string
  name: string | null
  email: string
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
  status: string
  dueDate: string | null
  labels: JobLabels | null
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: { id: string; userId: string; role: string; user: { id: string; name: string | null; email: string } }[]
  client?: { id: string; firstName: string; lastName: string | null; email: string | null } | null
  taskCount: number
  respondedCount: number
  completedCount: number
}

// ============================================
// Helper to get initials
// ============================================
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

// Status config matching Bills UI style
const STATUS_CONFIG: Record<string, { label: string; count?: number }> = {
  ACTIVE: { label: "Active" },
  WAITING: { label: "Waiting" },
  COMPLETED: { label: "Completed" },
  ARCHIVED: { label: "Archived" },
}

// ============================================
// Main Component
// ============================================

export default function JobsPage() {
  const router = useRouter()
  
  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobTags, setNewJobTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState("")
  const [creating, setCreating] = useState(false)

  // ============================================
  // Derived data
  // ============================================
  
  // Collect all unique tags from ALL jobs
  const allTags = Array.from(
    new Set(allJobs.flatMap(job => job.labels?.tags || []))
  ).sort()

  // Count jobs by status
  const statusCounts = allJobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ============================================
  // Data fetching
  // ============================================

  const fetchAllJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs`, { credentials: "include" })
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
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter)
      if (tagFilter.length > 0) params.set("tags", tagFilter.join(","))
      
      const response = await fetch(`/api/jobs?${params.toString()}`, { credentials: "include" })
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
  }, [statusFilter, tagFilter])

  useEffect(() => { fetchAllJobs() }, [fetchAllJobs])
  useEffect(() => { fetchJobs() }, [fetchJobs])

  // ============================================
  // Handlers
  // ============================================

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

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-6">
        {/* Page Header - matching Bills style */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {UI_LABELS.jobsPageTitle}
          </h1>
          <p className="text-sm text-gray-500">
            {UI_LABELS.jobsPageSubtitle}
          </p>
        </div>

        {/* Status Pills - matching Bills UI exactly */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {/* Status pills like Bills */}
            <button
              onClick={() => setStatusFilter("ACTIVE")}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${statusFilter === "ACTIVE" 
                  ? "bg-gray-900 text-white" 
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }
              `}
            >
              Active
              {statusCounts.ACTIVE > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  statusFilter === "ACTIVE" ? "bg-white/20" : "bg-gray-100"
                }`}>
                  {statusCounts.ACTIVE}
                </span>
              )}
            </button>
            
            <button
              onClick={() => setStatusFilter("WAITING")}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${statusFilter === "WAITING" 
                  ? "bg-gray-900 text-white" 
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }
              `}
            >
              Waiting
              {statusCounts.WAITING > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  statusFilter === "WAITING" ? "bg-white/20" : "bg-gray-100"
                }`}>
                  {statusCounts.WAITING}
                </span>
              )}
            </button>

            <button
              onClick={() => setStatusFilter("COMPLETED")}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${statusFilter === "COMPLETED" 
                  ? "bg-gray-900 text-white" 
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }
              `}
            >
              Completed
              {statusCounts.COMPLETED > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  statusFilter === "COMPLETED" ? "bg-white/20" : "bg-gray-100"
                }`}>
                  {statusCounts.COMPLETED}
                </span>
              )}
            </button>

            <button
              onClick={() => setStatusFilter("ARCHIVED")}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${statusFilter === "ARCHIVED" 
                  ? "bg-gray-900 text-white" 
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }
              `}
            >
              Archived
            </button>

            <button
              onClick={() => setStatusFilter("all")}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${statusFilter === "all" 
                  ? "bg-gray-900 text-white" 
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }
              `}
            >
              All
            </button>
          </div>

          {/* New Item CTA - matching Bills "New Bill" button style */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <button className="
                flex items-center gap-2 px-4 py-2 
                border border-gray-200 rounded-full
                text-sm font-medium text-gray-700
                hover:border-orange-500 hover:text-orange-500
                transition-colors
              ">
                <Plus className="w-4 h-4 text-orange-500" />
                {UI_LABELS.newJob}
              </button>
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
                  <Label>Labels (optional)</Label>
                  <div className="mt-2">
                    {newJobTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {newJobTags.map(tag => (
                          <Chip
                            key={tag}
                            label={tag}
                            color="gray"
                            removable
                            onRemove={() => setNewJobTags(prev => prev.filter(t => t !== tag))}
                          />
                        ))}
                      </div>
                    )}
                    
                    {allTags.filter(t => !newJobTags.includes(t)).length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-gray-500 mb-1">Click to add:</p>
                        <div className="flex flex-wrap gap-1">
                          {allTags.filter(t => !newJobTags.includes(t)).slice(0, 8).map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNewJobTags(prev => [...prev, tag])}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200 transition-colors"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <Input
                      placeholder="Or type a new label and press Enter"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={handleAddNewTag}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <button
                    onClick={handleCreateJob}
                    disabled={!newJobName.trim() || creating}
                    className="
                      px-4 py-2 rounded-md text-sm font-medium
                      bg-gray-900 text-white
                      hover:bg-gray-800
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors
                    "
                  >
                    {creating ? "Creating..." : UI_LABELS.createJob}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filter Row - matching Bills */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Input
              placeholder="Search"
              className="pl-10 bg-white border-gray-200"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="
              flex items-center gap-2 px-4 py-2
              border border-gray-200 rounded-lg
              text-sm font-medium text-gray-700
              hover:bg-gray-50 transition-colors
            "
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg">
            <EmptyState
              icon={<Briefcase className="w-6 h-6" />}
              title={`No ${UI_LABELS.jobPlural.toLowerCase()} yet`}
              description={`Create your first ${UI_LABELS.jobSingular.toLowerCase()} to start organizing work`}
              action={{
                label: UI_LABELS.createJob,
                onClick: () => setIsCreateOpen(true)
              }}
            />
          </div>
        ) : (
          /* Table-style list matching Bills */
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-5">Name</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Owner</div>
              <div className="col-span-2">Due Date</div>
              <div className="col-span-1">Updated</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {jobs.map((job) => {
                const jobTags = job.labels?.tags || []
                const dueDate = job.dueDate ? new Date(job.dueDate) : null
                const daysUntilDue = dueDate ? differenceInDays(dueDate, new Date()) : null
                const isOverdue = daysUntilDue !== null && daysUntilDue < 0
                
                return (
                  <div
                    key={job.id}
                    onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center"
                  >
                    {/* Name + Labels */}
                    <div className="col-span-5">
                      <div className="font-medium text-gray-900 mb-0.5">
                        {job.name}
                      </div>
                      {jobTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {jobTags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                          {jobTags.length > 3 && (
                            <span className="text-xs text-gray-400">+{jobTags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Status - pill style like Bills */}
                    <div className="col-span-2">
                      <span className={`
                        inline-flex px-2.5 py-1 rounded-full text-xs font-medium border
                        ${job.status === "ACTIVE" ? "border-gray-300 text-gray-700" : ""}
                        ${job.status === "WAITING" ? "border-amber-200 text-amber-700 bg-amber-50" : ""}
                        ${job.status === "COMPLETED" ? "border-green-200 text-green-700 bg-green-50" : ""}
                        ${job.status === "ARCHIVED" ? "border-gray-200 text-gray-500" : ""}
                        ${!["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].includes(job.status) ? "border-purple-200 text-purple-700 bg-purple-50" : ""}
                      `}>
                        {STATUS_CONFIG[job.status]?.label || job.status}
                      </span>
                    </div>
                    
                    {/* Owner */}
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
                        {getInitials(job.owner.name, job.owner.email)}
                      </div>
                      <span className="text-sm text-gray-600 truncate">
                        {job.owner.name?.split(" ")[0] || job.owner.email.split("@")[0]}
                      </span>
                    </div>
                    
                    {/* Due Date */}
                    <div className="col-span-2">
                      {dueDate ? (
                        <span className={`text-sm ${isOverdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                          {format(dueDate, "d MMM")}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    
                    {/* Updated */}
                    <div className="col-span-1 text-sm text-gray-500">
                      {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: false })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
