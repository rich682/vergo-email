"use client"

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react"
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
import { Plus, Briefcase, X, Filter, Check } from "lucide-react"
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
// Helpers
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

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "WAITING", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
]

// ============================================
// Main Component
// ============================================

export default function JobsPage() {
  const router = useRouter()
  const filterRef = useRef<HTMLDivElement>(null)
  
  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Filter state - multi-select
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobTags, setNewJobTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState("")
  const [creating, setCreating] = useState(false)

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // ============================================
  // Derived data
  // ============================================
  
  const allTags = Array.from(
    new Set(allJobs.flatMap(job => job.labels?.tags || []))
  ).sort()

  const hasActiveFilters = statusFilters.length > 0 || tagFilters.length > 0

  // Filter jobs client-side for search
  const filteredJobs = jobs.filter(job => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      job.name.toLowerCase().includes(query) ||
      job.description?.toLowerCase().includes(query) ||
      job.owner.name?.toLowerCase().includes(query) ||
      job.owner.email.toLowerCase().includes(query)
    )
  })

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
      // Support multiple statuses by fetching all and filtering client-side
      // Or if API supports it, pass comma-separated
      if (statusFilters.length === 1) {
        params.set("status", statusFilters[0])
      }
      if (tagFilters.length > 0) {
        params.set("tags", tagFilters.join(","))
      }
      
      const response = await fetch(`/api/jobs?${params.toString()}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        let fetchedJobs = data.jobs || []
        
        // Client-side filter for multiple statuses
        if (statusFilters.length > 1) {
          fetchedJobs = fetchedJobs.filter((job: Job) => statusFilters.includes(job.status))
        }
        
        setJobs(fetchedJobs)
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/jobs"
      }
    } catch (error) {
      console.error("Error fetching jobs:", error)
    } finally {
      setLoading(false)
    }
  }, [statusFilters, tagFilters])

  useEffect(() => { fetchAllJobs() }, [fetchAllJobs])
  useEffect(() => { fetchJobs() }, [fetchJobs])

  // ============================================
  // Handlers
  // ============================================

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  const toggleTagFilter = (tag: string) => {
    setTagFilters(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const clearAllFilters = () => {
    setStatusFilters([])
    setTagFilters([])
  }

  const removeFilter = (type: "status" | "tag", value: string) => {
    if (type === "status") {
      setStatusFilters(prev => prev.filter(s => s !== value))
    } else {
      setTagFilters(prev => prev.filter(t => t !== value))
    }
  }

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
      <div className="px-8 py-4">
        {/* Action Row */}
        <div className="flex items-center justify-end mb-4">
          {/* New Item CTA */}
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

        {/* Search and Filter Row */}
        <div className="flex items-center gap-3 mb-4 mt-4">
          {/* Search */}
          <div className="relative flex-1 max-w-lg">
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200 rounded-full"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Filter Dropdown */}
          <div className="relative" ref={filterRef}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`
                flex items-center gap-2 px-4 py-2
                border rounded-full
                text-sm font-medium
                transition-colors
                ${hasActiveFilters 
                  ? "border-gray-900 bg-gray-900 text-white" 
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              <Filter className="w-4 h-4" />
              Filter
              {hasActiveFilters && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
                  {statusFilters.length + tagFilters.length}
                </span>
              )}
            </button>

            {/* Filter Dropdown Panel */}
            {isFilterOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                {/* Status Section */}
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Status</p>
                  <div className="space-y-1">
                    {STATUS_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        onClick={() => toggleStatusFilter(option.value)}
                        className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-left"
                      >
                        <span className="text-gray-700">{option.label}</span>
                        {statusFilters.includes(option.value) && (
                          <Check className="w-4 h-4 text-gray-900" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Labels Section */}
                {allTags.length > 0 && (
                  <div className="p-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Labels</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleTagFilter(tag)}
                          className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-left"
                        >
                          <span className="text-gray-700">{tag}</span>
                          {tagFilters.includes(tag) && (
                            <Check className="w-4 h-4 text-gray-900" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clear All */}
                {hasActiveFilters && (
                  <div className="p-2">
                    <button
                      onClick={clearAllFilters}
                      className="w-full px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {statusFilters.map(status => (
              <button
                key={status}
                onClick={() => removeFilter("status", status)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {STATUS_OPTIONS.find(s => s.value === status)?.label || status}
                <X className="w-3.5 h-3.5" />
              </button>
            ))}
            {tagFilters.map(tag => (
              <button
                key={tag}
                onClick={() => removeFilter("tag", tag)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {tag}
                <X className="w-3.5 h-3.5" />
              </button>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-sm text-blue-600 hover:text-blue-700 ml-1"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg">
            <EmptyState
              icon={<Briefcase className="w-6 h-6" />}
              title={hasActiveFilters || searchQuery ? "No matching items" : `No ${UI_LABELS.jobPlural.toLowerCase()} yet`}
              description={
                hasActiveFilters || searchQuery 
                  ? "Try adjusting your filters or search query"
                  : `Create your first ${UI_LABELS.jobSingular.toLowerCase()} to start organizing work`
              }
              action={
                hasActiveFilters || searchQuery 
                  ? { label: "Clear Filters", onClick: () => { clearAllFilters(); setSearchQuery(""); } }
                  : { label: UI_LABELS.createJob, onClick: () => setIsCreateOpen(true) }
              }
            />
          </div>
        ) : (
          /* Table-style list */
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
              {filteredJobs.map((job) => {
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
                    
                    {/* Status */}
                    <div className="col-span-2">
                      <span className={`
                        inline-flex px-2.5 py-1 rounded-full text-xs font-medium border
                        ${job.status === "ACTIVE" ? "border-gray-300 text-gray-700" : ""}
                        ${job.status === "WAITING" ? "border-amber-200 text-amber-700 bg-amber-50" : ""}
                        ${job.status === "COMPLETED" ? "border-green-200 text-green-700 bg-green-50" : ""}
                        ${job.status === "ARCHIVED" ? "border-gray-200 text-gray-500" : ""}
                        ${!["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].includes(job.status) ? "border-purple-200 text-purple-700 bg-purple-50" : ""}
                      `}>
                        {STATUS_OPTIONS.find(s => s.value === job.status)?.label || job.status}
                      </span>
                    </div>
                    
                    {/* Owner */}
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">
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
