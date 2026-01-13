"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Plus, Briefcase, Zap, Search, ArrowRight } from "lucide-react"
import { UI_LABELS } from "@/lib/ui-labels"

interface Job {
  id: string
  name: string
  status: string
  dueDate: string | null
  taskCount: number
}

interface NewRequestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Feature flag check for Jobs UI
function isJobsUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JOBS_UI === "true"
}

export function NewRequestModal({ open, onOpenChange }: NewRequestModalProps) {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const jobsEnabled = isJobsUIEnabled()

  // Fetch jobs when modal opens
  useEffect(() => {
    if (open && jobsEnabled) {
      const fetchJobs = async () => {
        try {
          setLoading(true)
          const res = await fetch("/api/jobs?status=ACTIVE,WAITING")
          if (res.ok) {
            const data = await res.json()
            setJobs(data.jobs || [])
          }
        } catch (error) {
          console.error("Failed to fetch jobs:", error)
        } finally {
          setLoading(false)
        }
      }
      fetchJobs()
    }
  }, [open, jobsEnabled])

  // Filter jobs by search query
  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelectJob = (jobId: string) => {
    onOpenChange(false)
    router.push(`/dashboard/quest/new?jobId=${jobId}`)
  }

  const handleQuickRequest = () => {
    onOpenChange(false)
    router.push("/dashboard/quest/new")
  }

  const handleNewJob = () => {
    onOpenChange(false)
    router.push("/dashboard/jobs/new")
  }

  // If Jobs UI is not enabled, just go directly to Quest creator
  if (!jobsEnabled) {
    if (open) {
      onOpenChange(false)
      router.push("/dashboard/quest/new")
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quick Request Option */}
          <button
            onClick={handleQuickRequest}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{UI_LABELS.quickRequest}</div>
              <div className="text-sm text-gray-500">{UI_LABELS.quickRequestDescription}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">{UI_LABELS.addToExistingJob}</span>
            </div>
          </div>

          {/* Search Items */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={UI_LABELS.searchJobs}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Items List */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-4 text-sm text-gray-500">
                {searchQuery ? UI_LABELS.noJobsMatchSearch : UI_LABELS.noActiveJobs}
              </div>
            ) : (
              filteredJobs.slice(0, 5).map(job => (
                <button
                  key={job.id}
                  onClick={() => handleSelectJob(job.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{job.name}</div>
                    <div className="text-xs text-gray-500">
                      {job.taskCount} request{job.taskCount !== 1 ? "s" : ""}
                      {job.dueDate && ` • Due ${new Date(job.dueDate).toLocaleDateString()}`}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              ))
            )}
          </div>

          {/* Create New Item */}
          <button
            onClick={handleNewJob}
            className="w-full flex items-center gap-3 p-2 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-700">{UI_LABELS.createNewJob}</div>
              <div className="text-xs text-gray-500">{UI_LABELS.createNewJobDescription}</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
