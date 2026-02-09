"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Calendar, MessageSquare, Paperclip } from "lucide-react"
import { format } from "date-fns"

// ============================================
// Types
// ============================================

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
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-gray-300 cursor-pointer transition-all"
    >
      {/* Task Name */}
      <h4 className="font-medium text-gray-900 text-sm mb-2 line-clamp-2">
        {job.name}
      </h4>
      
      {/* Metadata Row */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {/* Owner */}
        <div className="flex items-center gap-1">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
              {getInitials(job.ownerName, job.ownerEmail)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate max-w-[60px]">
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
      className="flex-1 min-w-[280px] max-w-[320px] flex flex-col rounded-lg transition-colors"
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
// Main Kanban View Component
// ============================================

export function KanbanView({ jobs, onStatusChange }: KanbanViewProps) {
  const router = useRouter()
  
  // Group jobs by kanban column
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
        // Default to not_started if no match
        grouped["not_started"].push(job)
      }
    })
    
    return grouped
  }, [jobs])
  
  const handleTaskClick = (jobId: string) => {
    router.push(`/dashboard/jobs/${jobId}`)
  }
  
  const handleDropTask = (jobId: string, newStatus: string) => {
    onStatusChange(jobId, newStatus)
  }
  
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
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
  )
}
