"use client"

import { useState, useRef, useEffect } from "react"
import { format } from "date-fns"
import {
  Check,
  Circle,
  Clock,
  AlertTriangle,
  Paperclip,
  Trash2,
  MoreHorizontal,
  User,
  ChevronDown,
  Copy
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TeamMember {
  id: string
  name: string | null
  email: string
}

interface Subtask {
  id: string
  title: string
  description: string | null
  status: "NOT_STARTED" | "IN_PROGRESS" | "STUCK" | "DONE"
  dueDate: string | null
  owner: TeamMember | null
  attachmentCount: number
}

interface SubtaskRowProps {
  subtask: Subtask
  teamMembers: TeamMember[]
  onUpdate: (id: string, data: Partial<Subtask>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onViewAttachments: (id: string) => void
}

const statusConfig = {
  NOT_STARTED: {
    label: "Not Started",
    icon: Circle,
    color: "text-gray-500",
    bg: "bg-gray-100"
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Clock,
    color: "text-blue-500",
    bg: "bg-blue-100"
  },
  STUCK: {
    label: "Stuck",
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-100"
  },
  DONE: {
    label: "Done",
    icon: Check,
    color: "text-green-500",
    bg: "bg-green-100"
  }
}

// Simple dropdown component
function SimpleDropdown({
  trigger,
  children,
  align = "left"
}: {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: "left" | "right"
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div 
          className={cn(
            "absolute top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[140px]",
            align === "right" ? "right-0" : "left-0"
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function SubtaskRow({
  subtask,
  teamMembers,
  onUpdate,
  onDelete,
  onDuplicate,
  onViewAttachments
}: SubtaskRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(subtask.title)
  const [updating, setUpdating] = useState(false)

  const config = statusConfig[subtask.status]
  const StatusIcon = config.icon

  const handleTitleBlur = async () => {
    if (title.trim() !== subtask.title) {
      setUpdating(true)
      await onUpdate(subtask.id, { title: title.trim() })
      setUpdating(false)
    }
    setIsEditing(false)
  }

  const handleStatusChange = async (status: string) => {
    setUpdating(true)
    await onUpdate(subtask.id, { status: status as Subtask["status"] })
    setUpdating(false)
  }

  const handleOwnerChange = async (ownerId: string) => {
    setUpdating(true)
    await onUpdate(subtask.id, { owner: ownerId === "unassigned" ? null : { id: ownerId } as any })
    setUpdating(false)
  }

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUpdating(true)
    const date = e.target.value ? new Date(e.target.value) : null
    await onUpdate(subtask.id, { dueDate: date ? date.toISOString() : null })
    setUpdating(false)
  }

  const handleToggleComplete = async () => {
    const newStatus = subtask.status === "DONE" ? "NOT_STARTED" : "DONE"
    setUpdating(true)
    await onUpdate(subtask.id, { status: newStatus })
    setUpdating(false)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors",
        updating && "opacity-50 pointer-events-none"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={handleToggleComplete}
        className={cn(
          "w-5 h-5 rounded border flex items-center justify-center shrink-0",
          subtask.status === "DONE"
            ? "bg-green-500 border-green-500 text-white"
            : "border-gray-300 hover:border-gray-400"
        )}
      >
        {subtask.status === "DONE" && <Check className="w-3 h-3" />}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleBlur()
              if (e.key === "Escape") {
                setTitle(subtask.title)
                setIsEditing(false)
              }
            }}
            autoFocus
            className="h-7 text-sm"
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            className={cn(
              "text-sm cursor-pointer hover:text-blue-600 truncate block",
              subtask.status === "DONE" && "line-through text-gray-400"
            )}
          >
            {subtask.title}
          </span>
        )}
      </div>

      {/* Owner */}
      <SimpleDropdown
        trigger={
          <button className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-50 min-w-[100px]">
            {subtask.owner ? (
              <span className="truncate">
                {subtask.owner.name || subtask.owner.email}
              </span>
            ) : (
              <span className="text-gray-400 flex items-center gap-1">
                <User className="w-3 h-3" />
                Unassigned
              </span>
            )}
            <ChevronDown className="w-3 h-3 ml-auto text-gray-400" />
          </button>
        }
      >
        <div className="py-1">
          <button
            onClick={() => handleOwnerChange("unassigned")}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 text-gray-400"
          >
            Unassigned
          </button>
          {teamMembers.map((member) => (
            <button
              key={member.id}
              onClick={() => handleOwnerChange(member.id)}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              {member.name || member.email}
            </button>
          ))}
        </div>
      </SimpleDropdown>

      {/* Status */}
      <SimpleDropdown
        trigger={
          <button className="flex items-center gap-1.5 px-2 py-1 text-xs border rounded hover:bg-gray-50 min-w-[100px]">
            <StatusIcon className={cn("w-3 h-3", config.color)} />
            <span>{config.label}</span>
            <ChevronDown className="w-3 h-3 ml-auto text-gray-400" />
          </button>
        }
      >
        <div className="py-1">
          {Object.entries(statusConfig).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button
                key={key}
                onClick={() => handleStatusChange(key)}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-1.5"
              >
                <Icon className={cn("w-3 h-3", cfg.color)} />
                <span>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      </SimpleDropdown>

      {/* Due Date */}
      <input
        type="date"
        value={subtask.dueDate ? format(new Date(subtask.dueDate), "yyyy-MM-dd") : ""}
        onChange={handleDateChange}
        className="px-2 py-1 text-xs border rounded w-[110px] hover:bg-gray-50"
      />

      {/* Attachments */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => onViewAttachments(subtask.id)}
      >
        <Paperclip className="w-3.5 h-3.5" />
        {subtask.attachmentCount > 0 && (
          <span className="ml-1 text-xs">{subtask.attachmentCount}</span>
        )}
      </Button>

      {/* Actions */}
      <SimpleDropdown
        trigger={
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        }
        align="right"
      >
        <div className="py-1">
          <button
            onClick={() => onDuplicate(subtask.id)}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
          <button
            onClick={() => {
              if (window.confirm("Delete this subtask?")) {
                onDelete(subtask.id)
              }
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </SimpleDropdown>
    </div>
  )
}
