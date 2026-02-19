"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Calendar, MessageSquare, Paperclip, ArrowUpDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"

// ============================================
// Types
// ============================================

type SortOption = "created_newest" | "created_oldest" | "updated_newest" | "updated_oldest" | "az" | "za" | "due_date"

interface JobRow {
  id: string
  name: string
  status: string
  ownerId: string
  ownerName: string | null
  ownerEmail: string
  dueDate: string | null
  notes: string | null
  customFields?: Record<string, any>
  collectedItemCount?: number
  taskCount?: number
  respondedCount?: number
  taskType?: string | null
  createdAt?: string
  updatedAt?: string
}

interface KanbanViewProps {
  jobs: JobRow[]
  onStatusChange: (jobId: string, newStatus: string) => void
}

// ============================================
// Helpers
// ============================================

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(" ")
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function parseDateOnly(dateStr: string): Date {
  const datePart = dateStr.split("T")[0]
  const [year, month, day] = datePart.split("-").map(Number)
  return new Date(year, month - 1, day)
}

const TASK_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  reconciliation: { label: "Reconciliation", bg: "bg-emerald-50", text: "text-emerald-700" },
  report: { label: "Report", bg: "bg-blue-50", text: "text-blue-700" },
  form: { label: "Form", bg: "bg-purple-50", text: "text-purple-700" },
  request: { label: "Request", bg: "bg-amber-50", text: "text-amber-700" },
  analysis: { label: "Analysis", bg: "bg-cyan-50", text: "text-cyan-700" },
  other: { label: "Other", bg: "bg-gray-50", text: "text-gray-700" },
}

function normalizeStatus(status: string): string {
  // Handle legacy statuses
  switch (status) {
    case "ACTIVE":
    case "WAITING":
      return "IN_PROGRESS"
    case "COMPLETED":
    case "ARCHIVED":
      return "COMPLETE"
    default:
      return status
  }
}

// ============================================
// Kanban Column Definition
// ============================================

interface KanbanColumn {
  id: string
  title: string
  statuses: string[] // Statuses that belong to this column
  color: string
  bgColor: string
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "not_started",
    title: "Not Started",
    statuses: ["NOT_STARTED"],
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  {
    id: "in_progress",
    title: "In Progress",
    statuses: ["IN_PROGRESS", "ACTIVE", "WAITING"],
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  {
    id: "blocked",
    title: "Blocked",
    statuses: ["BLOCKED", "STUCK"],
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  {
    id: "complete",
    title: "Complete",
    statuses: ["COMPLETE", "COMPLETED"],
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
]

// ============================================
// Task Card Component
// ============================================

interface TaskCardProps {
  job: JobRow
  onClick: () => void
}

function TaskCard({ job, onClick }: TaskCardProps) {
  const isOverdue = job.dueDate && new Date(job.dueDate) < new Date()

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm hover:shadow-md hover:border-gray-300 cursor-pointer transition-all"
    >
      <div className="flex items-center gap-2">
        {/* Task Type Badge */}
        {job.taskType && TASK_TYPE_CONFIG[job.taskType] && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${TASK_TYPE_CONFIG[job.taskType].bg} ${TASK_TYPE_CONFIG[job.taskType].text}`}>
            {TASK_TYPE_CONFIG[job.taskType].label}
          </span>
        )}

        {/* Task Name */}
        <h4 className="font-medium text-gray-900 text-sm truncate flex-1 min-w-0">
          {job.name}
        </h4>

        {/* Metadata */}
        <div className="flex items-center gap-2.5 text-xs text-gray-500 flex-shrink-0">
          {/* Owner */}
          <div className="flex items-center gap-1">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                {getInitials(job.ownerName, job.ownerEmail)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate max-w-[70px]">
              {job.ownerName || job.ownerEmail.split("@")[0]}
            </span>
          </div>

          {/* Due Date */}
          {job.dueDate && (
            <div className={`flex items-center gap-1 ${isOverdue ? "text-red-500" : ""}`}>
              <Calendar className="w-3 h-3" />
              <span>{format(parseDateOnly(job.dueDate), "MMM d")}</span>
            </div>
          )}

          {/* Request Count */}
          {(job.taskCount || 0) > 0 && (
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>{job.taskCount}</span>
            </div>
          )}

          {/* Files Count */}
          {(job.collectedItemCount || 0) > 0 && (
            <div className="flex items-center gap-1">
              <Paperclip className="w-3 h-3" />
              <span>{job.collectedItemCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Kanban Column Component
// ============================================

interface KanbanColumnProps {
  column: KanbanColumn
  jobs: JobRow[]
  onTaskClick: (jobId: string) => void
  onDropTask: (jobId: string, newStatus: string) => void
}

function KanbanColumnComponent({ column, jobs, onTaskClick, onDropTask }: KanbanColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add("bg-gray-50")
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-gray-50")
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove("bg-gray-50")
    const jobId = e.dataTransfer.getData("jobId")
    if (jobId) {
      // Use the first status in the column's statuses array as the target
      onDropTask(jobId, column.statuses[0])
    }
  }
  
  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData("jobId", jobId)
  }
  
  return (
    <div
      className="flex-1 min-w-0 flex flex-col rounded-lg transition-colors"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${column.bgColor}`}>
        <h3 className={`font-medium text-sm ${column.color}`}>
          {column.title}
        </h3>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${column.bgColor} ${column.color}`}>
          {jobs.length}
        </span>
      </div>
      
      {/* Cards Container */}
      <div className="flex-1 p-2 space-y-2 bg-gray-50/50 rounded-b-lg min-h-[200px]">
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No tasks
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              draggable
              onDragStart={(e) => handleDragStart(e, job.id)}
            >
              <TaskCard
                job={job}
                onClick={() => onTaskClick(job.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================
// Sort Logic
// ============================================

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "created_newest", label: "Date created (newest)" },
  { value: "created_oldest", label: "Date created (oldest)" },
  { value: "updated_newest", label: "Last edited (newest)" },
  { value: "updated_oldest", label: "Last edited (oldest)" },
  { value: "az", label: "Name (A–Z)" },
  { value: "za", label: "Name (Z–A)" },
  { value: "due_date", label: "Due date (soonest)" },
]

function sortJobs(jobs: JobRow[], sortBy: SortOption): JobRow[] {
  return [...jobs].sort((a, b) => {
    switch (sortBy) {
      case "created_newest":
        return (b.createdAt || "").localeCompare(a.createdAt || "")
      case "created_oldest":
        return (a.createdAt || "").localeCompare(b.createdAt || "")
      case "updated_newest":
        return (b.updatedAt || "").localeCompare(a.updatedAt || "")
      case "updated_oldest":
        return (a.updatedAt || "").localeCompare(b.updatedAt || "")
      case "az":
        return a.name.localeCompare(b.name)
      case "za":
        return b.name.localeCompare(a.name)
      case "due_date": {
        // Tasks with no due date go to the end
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      default:
        return 0
    }
  })
}

// ============================================
// Main Kanban View Component
// ============================================

export function KanbanView({ jobs, onStatusChange }: KanbanViewProps) {
  const router = useRouter()
  const [sortBy, setSortBy] = useState<SortOption>("created_newest")

  // Group jobs by kanban column, then sort within each column
  const jobsByColumn = useMemo(() => {
    const grouped: Record<string, JobRow[]> = {}

    // Initialize all columns
    KANBAN_COLUMNS.forEach((col) => {
      grouped[col.id] = []
    })

    // Sort jobs into columns
    jobs.forEach((job) => {
      const normalized = normalizeStatus(job.status)
      const column = KANBAN_COLUMNS.find((col) =>
        col.statuses.some((s) => s === job.status || s === normalized)
      )
      if (column) {
        grouped[column.id].push(job)
      } else {
        grouped["not_started"].push(job)
      }
    })

    // Sort each column
    Object.keys(grouped).forEach((colId) => {
      grouped[colId] = sortJobs(grouped[colId], sortBy)
    })

    return grouped
  }, [jobs, sortBy])

  const handleTaskClick = (jobId: string) => {
    router.push(`/dashboard/jobs/${jobId}`)
  }

  const handleDropTask = (jobId: string, newStatus: string) => {
    onStatusChange(jobId, newStatus)
  }

  return (
    <div className="space-y-3">
      {/* Sort Controls */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="flex gap-4 pb-4">
        {KANBAN_COLUMNS.map((column) => (
          <KanbanColumnComponent
            key={column.id}
            column={column}
            jobs={jobsByColumn[column.id]}
            onTaskClick={handleTaskClick}
            onDropTask={handleDropTask}
          />
        ))}
      </div>
    </div>
  )
}
