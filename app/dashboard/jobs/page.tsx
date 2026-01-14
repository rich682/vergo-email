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
import { Plus, Briefcase, Calendar, Users, User, UserCircle, X, Clock, Tag } from "lucide-react"
import { formatDistanceToNow, format, differenceInDays } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"

// New design system components
import { PageHeader } from "@/components/ui/page-header"
import { FilterPills } from "@/components/ui/filter-pills"
import { Chip } from "@/components/ui/chip"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { DropdownFilter } from "@/components/ui/dropdown-filter"

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
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "my">("all")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [tagFilter, setTagFilter] = useState<string[]>([])
  
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

  // Collect all unique statuses
  const allStatuses = Array.from(
    new Set(allJobs.map(job => job.status))
  ).sort((a, b) => {
    const builtIn = ["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"]
    const aIdx = builtIn.indexOf(a)
    const bIdx = builtIn.indexOf(b)
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    if (aIdx !== -1) return -1
    if (bIdx !== -1) return 1
    return a.localeCompare(b)
  })

  // Status options for dropdown
  const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "WAITING", label: "Waiting" },
    { value: "COMPLETED", label: "Completed" },
    { value: "ARCHIVED", label: "Archived" },
    ...allStatuses
      .filter(s => !["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].includes(s))
      .map(s => ({ value: s, label: s }))
  ]

  const hasActiveFilters = statusFilter !== "" || ownershipFilter !== "all" || tagFilter.length > 0

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
      if (statusFilter) params.set("status", statusFilter)
      if (ownershipFilter === "my") params.set("myJobs", "true")
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
  }, [statusFilter, ownershipFilter, tagFilter])

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

  const clearAllFilters = () => {
    setStatusFilter("")
    setOwnershipFilter("all")
    setTagFilter([])
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="p-6">
      {/* Page Header */}
      <PageHeader
        title={UI_LABELS.jobsPageTitle}
        subtitle={UI_LABELS.jobsPageSubtitle}
        action={
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
                  <Label>Labels (optional)</Label>
                  <div className="mt-2">
                    {/* Selected tags */}
                    {newJobTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {newJobTags.map(tag => (
                          <Chip
                            key={tag}
                            label={tag}
                            color="blue"
                            removable
                            onRemove={() => setNewJobTags(prev => prev.filter(t => t !== tag))}
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Existing labels as suggestions */}
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
        }
      />

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Ownership Toggle */}
        <FilterPills
          options={[
            { value: "all", label: UI_LABELS.allJobs },
            { value: "my", label: UI_LABELS.myJobs, icon: <UserCircle className="w-3.5 h-3.5" /> }
          ]}
          value={ownershipFilter}
          onChange={(v) => setOwnershipFilter(v as "all" | "my")}
        />

        {/* Status Filter */}
        <DropdownFilter
          label="Status"
          icon={<Clock className="w-4 h-4" />}
          options={statusOptions}
          selected={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
        />

        {/* Labels Filter */}
        <DropdownFilter
          label="Labels"
          icon={<Tag className="w-4 h-4" />}
          options={allTags.map(t => ({ value: t, label: t }))}
          selected={tagFilter}
          onChange={(v) => setTagFilter(v as string[])}
          multiple
          placeholder="Labels"
        />

        {/* Active Filters */}
        {hasActiveFilters && (
          <>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-1.5 flex-wrap">
              {statusFilter && (
                <Chip
                  label={statusOptions.find(s => s.value === statusFilter)?.label || statusFilter}
                  color="blue"
                  removable
                  onRemove={() => setStatusFilter("")}
                  size="sm"
                />
              )}
              {tagFilter.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  color="purple"
                  removable
                  onRemove={() => setTagFilter(prev => prev.filter(t => t !== tag))}
                  size="sm"
                />
              ))}
            </div>
            <button
              onClick={clearAllFilters}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
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
        <div className="space-y-2">
          {jobs.map((job) => {
            const jobTags = job.labels?.tags || []
            const dueDate = job.dueDate ? new Date(job.dueDate) : null
            const daysUntilDue = dueDate ? differenceInDays(dueDate, new Date()) : null
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0
            const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3
            
            return (
              <div
                key={job.id}
                onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                className="
                  bg-white border border-gray-200 rounded-lg p-4
                  hover:border-gray-300 hover:shadow-sm
                  cursor-pointer transition-all duration-150
                "
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Title + Status */}
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {job.name}
                      </h3>
                      <StatusBadge status={job.status} size="sm" />
                    </div>
                    
                    {/* Labels */}
                    {jobTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {jobTags.map(tag => (
                          <Chip key={tag} label={tag} color="gray" size="sm" />
                        ))}
                      </div>
                    )}
                    
                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-medium text-gray-600">
                          {getInitials(job.owner.name, job.owner.email)}
                        </div>
                        {job.owner.name || job.owner.email.split("@")[0]}
                      </span>
                      <span>·</span>
                      <span>Updated {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}</span>
                    </div>
                  </div>

                  {/* Right: Due date */}
                  {dueDate && (
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-sm font-medium ${
                        isOverdue ? "text-red-600" : isDueSoon ? "text-amber-600" : "text-gray-600"
                      }`}>
                        {isOverdue 
                          ? "Overdue" 
                          : isDueSoon 
                          ? `${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""} left`
                          : format(dueDate, "MMM d")
                        }
                      </div>
                      <div className="text-xs text-gray-400">
                        {format(dueDate, "yyyy")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
