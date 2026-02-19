"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Search,
  MoreHorizontal,
  Archive,
  Trash2,
  Copy,
  RotateCcw,
  Loader2,
  Pencil,
  PlayCircle,
  CheckCircle2,
  PauseCircle,
  Check,
  Lock,
} from "lucide-react"
import { formatDistanceToNow, differenceInDays, parseISO } from "date-fns"
import {
  formatDateInTimezone,
  formatMonthYearInTimezone,
  getMonthInTimezone,
  getYearInTimezone,
  formatPeriodDisplay
} from "@/lib/utils/timezone"
import { CreateBoardModal } from "@/components/boards/create-board-modal"
import { usePermissions } from "@/components/permissions-context"

import { EditBoardModal } from "@/components/boards/edit-board-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BoardColumnHeader, BoardColumnDefinition } from "@/components/boards/board-column-header"

// Default board columns (for advanced mode)
const DEFAULT_BOARD_COLUMNS: BoardColumnDefinition[] = [
  { id: "name", label: "Item", width: 280, visible: true, order: 0, isSystem: true },
  { id: "cadence", label: "Cadence", width: 100, visible: true, order: 1, isSystem: true },
  { id: "period", label: "Period", width: 140, visible: true, order: 2, isSystem: true },
  { id: "status", label: "Status", width: 120, visible: true, order: 3, isSystem: true },
  { id: "owner", label: "Person", width: 140, visible: true, order: 4, isSystem: true },
  { id: "updatedAt", label: "Date", width: 120, visible: true, order: 5, isSystem: true },
]


// Types
type BoardStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "ARCHIVED" | "OPEN" | "CLOSED"
type BoardCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC"

interface BoardOwner {
  id: string
  name: string | null
  email: string
}

interface BoardCollaborator {
  id: string
  userId: string
  role: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface Board {
  id: string
  name: string
  status: BoardStatus
  cadence: BoardCadence | null
  periodStart: string | null
  periodEnd: string | null
  taskInstanceCount: number
  owner: BoardOwner | null
  collaborators: BoardCollaborator[]
  updatedAt: string
  createdAt: string
  automationEnabled?: boolean
  skipWeekends?: boolean
}

type StatusFilter = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "ARCHIVED" | "ALL"
type CadenceFilter = BoardCadence | "ALL"
type SortOption = "recent" | "name" | "period" | "status"

// Helper functions
function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(" ")
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function normalizeStatus(status: BoardStatus): BoardStatus {
  // Handle legacy statuses
  if (status === "OPEN") return "NOT_STARTED"
  if (status === "CLOSED") return "CLOSED" // Keep CLOSED as first-class
  return status
}

function getStatusBadge(status: BoardStatus) {
  const normalized = normalizeStatus(status)
  switch (normalized) {
    case "NOT_STARTED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Not Started</span>
    case "IN_PROGRESS":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">In Progress</span>
    case "COMPLETE":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Complete</span>
    case "CLOSED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Closed</span>
    case "BLOCKED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Blocked</span>
    case "ARCHIVED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Archived</span>
    default:
      return null
  }
}

function getCadenceBadge(cadence: BoardCadence | null) {
  if (!cadence) return <span className="text-gray-400">—</span>

  const colors: Record<BoardCadence, string> = {
    DAILY: "bg-purple-100 text-purple-700",
    WEEKLY: "bg-indigo-100 text-indigo-700",
    MONTHLY: "bg-blue-100 text-blue-700",
    QUARTERLY: "bg-cyan-100 text-cyan-700",
    YEAR_END: "bg-orange-100 text-orange-700",
    AD_HOC: "bg-gray-100 text-gray-600",
  }

  const labels: Record<BoardCadence, string> = {
    DAILY: "Daily",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    YEAR_END: "Year-End",
    AD_HOC: "Ad Hoc",
  }

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[cadence]}`}>
      {labels[cadence]}
    </span>
  )
}

/**
 * Format period using the shared timezone utility.
 */
function formatPeriod(periodStart: string | null, periodEnd: string | null, cadence: BoardCadence | null, timezone: string): string {
  if (!timezone) {
    console.warn("[BoardsPage] formatPeriod called without timezone")
  }
  return formatPeriodDisplay(periodStart, periodEnd, cadence, timezone)
}

const STATUS_ORDER: Record<BoardStatus, number> = {
  IN_PROGRESS: 1,
  NOT_STARTED: 2,
  BLOCKED: 3,
  COMPLETE: 4,
  CLOSED: 4,
  ARCHIVED: 5,
  OPEN: 2, // Legacy - treat as NOT_STARTED
}

// ============================================
// Simplified mode helpers
// ============================================

function isCurrentMonth(periodStart: string | null): boolean {
  if (!periodStart) return false
  const date = parseISO(periodStart)
  const now = new Date()
  // Use UTC methods since periodStart is stored as UTC midnight (e.g. 2026-02-01T00:00:00.000Z)
  return date.getUTCMonth() === now.getMonth() && date.getUTCFullYear() === now.getFullYear()
}

function isFutureMonth(periodStart: string | null): boolean {
  if (!periodStart) return false
  const date = parseISO(periodStart)
  const now = new Date()
  // Compare using UTC month/year from stored date vs local current date
  const boardYear = date.getUTCFullYear()
  const boardMonth = date.getUTCMonth()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  return boardYear > currentYear || (boardYear === currentYear && boardMonth > currentMonth)
}

function getDaysUntilClose(periodEnd: string | null, isClosed: boolean): { text: string; className: string } | null {
  if (!periodEnd) return null
  if (isClosed) return { text: "Closed", className: "text-green-600" }

  const end = parseISO(periodEnd)
  const now = new Date()
  const days = differenceInDays(end, now)

  if (days < 0) {
    return { text: "Overdue", className: "text-red-600 font-medium" }
  }
  if (days === 0) {
    return { text: "Due today", className: "text-orange-600 font-medium" }
  }
  if (days === 1) {
    return { text: "1 day", className: "text-orange-600" }
  }
  return { text: `${days} days`, className: "text-gray-600" }
}

function getSimplifiedStatusBadge(status: BoardStatus, isCurrent: boolean, isFuture: boolean) {
  if (isFuture) {
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Not Started</span>
  }

  if (isCurrent && (status === "NOT_STARTED" || status === "OPEN")) {
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">In Progress</span>
  }

  const normalized = normalizeStatus(status)
  // Map COMPLETE → Closed for display in simplified mode
  const displayStatus = normalized === "COMPLETE" ? "CLOSED" : normalized

  const statusMap: Record<string, { label: string; className: string }> = {
    "NOT_STARTED": { label: "Not Started", className: "bg-gray-100 text-gray-600" },
    "IN_PROGRESS": { label: "In Progress", className: "bg-blue-100 text-blue-700" },
    "CLOSED": { label: "Closed", className: "bg-green-100 text-green-700" },
  }

  const config = statusMap[displayStatus] || statusMap["NOT_STARTED"]
  return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.className}`}>{config.label}</span>
}

// ============================================
// Main Component
// ============================================

export default function BoardsPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const canManageBoards = can("boards:manage")
  const canEditColumns = can("boards:edit_columns")
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>("ALL")
  const [sortOption, setSortOption] = useState<SortOption>("recent")

  // Organization timezone for date formatting
  const [organizationTimezone, setOrganizationTimezone] = useState<string>("UTC")

  // Feature flag
  const [advancedBoardTypes, setAdvancedBoardTypes] = useState(false)

  // Modal states
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<{ open: boolean; boardId: string | null; boardName: string }>({ open: false, boardId: null, boardName: "" })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; boardId: string | null; boardName: string }>({ open: false, boardId: null, boardName: "" })

  // Column configuration state (for board rows - advanced mode only)
  const [columns, setColumns] = useState<BoardColumnDefinition[]>(DEFAULT_BOARD_COLUMNS)

  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch column configurations on mount (advanced mode only)
  useEffect(() => {
    if (!advancedBoardTypes) return
    const fetchColumnConfig = async () => {
      try {
        const response = await fetch("/api/boards/column-config", {
          credentials: "include"
        })
        if (response.ok) {
          const data = await response.json()
          if (data.columns && data.columns.length > 0) {
            setColumns(data.columns)
          }
        }
      } catch (error) {
        console.error("Error fetching board column config:", error)
      }
    }
    fetchColumnConfig()
  }, [advancedBoardTypes])

  // Save column configuration when columns change
  const saveColumnConfig = useCallback(async (newColumns: BoardColumnDefinition[]) => {
    try {
      await fetch("/api/boards/column-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ columns: newColumns })
      })
    } catch (error) {
      console.error("Error saving board column config:", error)
    }
  }, [])

  const handleColumnsChange = useCallback((newColumns: BoardColumnDefinition[]) => {
    setColumns(newColumns)
    saveColumnConfig(newColumns)
  }, [saveColumnConfig])

  // Filter visible columns and sort by order
  const visibleColumns = useMemo(() => {
    return columns
      .filter(col => col.visible)
      .sort((a, b) => a.order - b.order)
  }, [columns])

  // Fetch all boards
  const fetchBoards = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/boards")
      if (response.ok) {
        const data = await response.json()
        setBoards(data.boards || [])
        if (data.organizationTimezone) {
          setOrganizationTimezone(data.organizationTimezone)
        }
        setAdvancedBoardTypes(data.advancedBoardTypes || false)
      }
    } catch (error) {
      console.error("Error fetching boards:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBoards()
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null)
      }
    }

    if (menuOpenId) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [menuOpenId])

  // Boards sorted by periodStart for simplified mode
  const sortedBoards = useMemo(() => {
    if (advancedBoardTypes) return boards
    return [...boards].sort((a, b) => {
      if (!a.periodStart && !b.periodStart) return 0
      if (!a.periodStart) return 1
      if (!b.periodStart) return -1
      return new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
    })
  }, [boards, advancedBoardTypes])

  // Filter and sort boards (advanced mode)
  const filteredBoards = useMemo(() => {
    return boards
      .filter(board => {
        if (statusFilter !== "ALL") {
          const normalized = normalizeStatus(board.status)
          if (normalized !== statusFilter) {
            return false
          }
        } else {
          if (normalizeStatus(board.status) === "ARCHIVED") {
            return false
          }
        }
        if (cadenceFilter !== "ALL" && board.cadence !== cadenceFilter) {
          return false
        }
        if (searchQuery && !board.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        switch (sortOption) {
          case "name":
            return a.name.localeCompare(b.name)
          case "period":
            if (!a.periodStart && !b.periodStart) return 0
            if (!a.periodStart) return 1
            if (!b.periodStart) return -1
            return new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime()
          case "status":
            return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          default:
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }
      })
  }, [boards, statusFilter, cadenceFilter, searchQuery, sortOption])

  // Split boards into recurring, ad hoc, and complete sections (advanced mode)
  const { recurringBoards, adHocBoards, completeBoards } = useMemo(() => {
    const recurring: Board[] = []
    const adHoc: Board[] = []
    const complete: Board[] = []

    filteredBoards.forEach(board => {
      const normalized = normalizeStatus(board.status)
      if (normalized === "COMPLETE" || normalized === "CLOSED") {
        complete.push(board)
      } else if (board.cadence === "AD_HOC" || !board.cadence) {
        adHoc.push(board)
      } else {
        recurring.push(board)
      }
    })

    return { recurringBoards: recurring, adHocBoards: adHoc, completeBoards: complete }
  }, [filteredBoards])

  // Board actions
  const handleArchiveBoard = (board: Board) => {
    setArchiveConfirm({ open: true, boardId: board.id, boardName: board.name })
    setMenuOpenId(null)
  }

  const confirmArchiveBoard = async () => {
    if (!archiveConfirm.boardId) return
    try {
      const response = await fetch(`/api/boards/${archiveConfirm.boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" })
      })
      if (response.ok) {
        fetchBoards()
      }
    } catch (error) {
      console.error("Error archiving board:", error)
    }
    setArchiveConfirm({ open: false, boardId: null, boardName: "" })
  }

  const handleRestoreBoard = async (boardId: string) => {
    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NOT_STARTED" })
      })
      if (response.ok) {
        fetchBoards()
        setMenuOpenId(null)
      }
    } catch (error) {
      console.error("Error restoring board:", error)
    }
  }

  const handleDeleteBoard = (board: Board) => {
    setDeleteConfirm({ open: true, boardId: board.id, boardName: board.name })
    setMenuOpenId(null)
  }

  const confirmDeleteBoard = async () => {
    if (!deleteConfirm.boardId) return
    try {
      const response = await fetch(`/api/boards/${deleteConfirm.boardId}?hard=true`, {
        method: "DELETE"
      })
      if (response.ok) {
        fetchBoards()
      }
    } catch (error) {
      console.error("Error deleting board:", error)
    }
    setDeleteConfirm({ open: false, boardId: null, boardName: "" })
  }

  const handleDuplicateBoard = async (board: Board) => {
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${board.name} (Copy)`,
          duplicateFromId: board.id,
          cadence: board.cadence
        })
      })
      if (response.ok) {
        const data = await response.json()
        fetchBoards()
        setMenuOpenId(null)
        router.push(`/dashboard/jobs?boardId=${data.board.id}`)
      }
    } catch (error) {
      console.error("Error duplicating board:", error)
    }
  }

  const handleStatusChange = async (boardId: string, newStatus: BoardStatus) => {
    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      })
      if (response.ok) {
        fetchBoards()
        setMenuOpenId(null)
      }
    } catch (error) {
      console.error("Error updating board status:", error)
    }
  }

  const canDeleteBoard = (board: Board): boolean => {
    return (board.taskInstanceCount || 0) === 0
  }

  const handleBoardUpdate = (updatedBoard: Board) => {
    setBoards(prev => prev.map(b =>
      b.id === updatedBoard.id ? { ...b, ...updatedBoard } : b
    ))
    fetchBoards()
  }

  // ============================================
  // Simplified Book Close View
  // ============================================
  if (!advancedBoardTypes) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Book Close</h1>
          <p className="text-sm text-gray-500 mt-1">Track your monthly close progress</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : sortedBoards.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Setting up your book close...</span>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_140px_160px] gap-4 px-6 py-3 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div>Month</div>
              <div>Status</div>
              <div>Days Until Close</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-gray-100">
              {sortedBoards.map((board) => {
                const current = isCurrentMonth(board.periodStart)
                const future = isFutureMonth(board.periodStart)
                const isClosed = board.status === "CLOSED" || board.status === "COMPLETE"
                const daysInfo = getDaysUntilClose(board.periodEnd, isClosed)

                return (
                  <div
                    key={board.id}
                    className={`
                      grid grid-cols-[1fr_140px_160px] gap-4 px-6 py-4 items-center transition-colors
                      ${current ? "border-l-4 border-l-orange-500 bg-orange-50/50 pl-5" : ""}
                      ${future ? "opacity-50" : "hover:bg-gray-50 cursor-pointer"}
                    `}
                    onClick={() => {
                      if (future) return
                      router.push(`/dashboard/jobs?boardId=${board.id}`)
                    }}
                  >
                    {/* Month Name */}
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${current ? "text-orange-900" : future ? "text-gray-400" : "text-gray-900"}`}>
                        {board.name}
                      </span>
                      {current && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-orange-100 text-orange-700">
                          Current
                        </span>
                      )}
                      {future && (
                        <Lock className="w-3.5 h-3.5 text-gray-300" />
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      {getSimplifiedStatusBadge(board.status, current, future)}
                    </div>

                    {/* Days Until Close */}
                    <div className="text-sm">
                      {isClosed ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <Check className="w-3.5 h-3.5" />
                          Closed
                        </span>
                      ) : daysInfo ? (
                        <span className={daysInfo.className}>{daysInfo.text}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============================================
  // Advanced Mode (original UI)
  // ============================================
  return (
    <div className="p-8">
      {/* Filters + Action */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search boards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Active</SelectItem>
            <SelectItem value="NOT_STARTED">Not Started</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETE">Complete</SelectItem>
            <SelectItem value="BLOCKED">Blocked</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={cadenceFilter} onValueChange={(v) => setCadenceFilter(v as CadenceFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Cadence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cadences</SelectItem>
            <SelectItem value="DAILY">Daily</SelectItem>
            <SelectItem value="WEEKLY">Weekly</SelectItem>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
            <SelectItem value="QUARTERLY">Quarterly</SelectItem>
            <SelectItem value="YEAR_END">Year-End</SelectItem>
            <SelectItem value="AD_HOC">Ad Hoc</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="period">Time Period</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>

        {canManageBoards && (
        <div className="ml-auto">
          <Button onClick={() => setIsCreateBoardOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Board
          </Button>
        </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filteredBoards.length === 0 ? (
        searchQuery || statusFilter !== "ALL" || cadenceFilter !== "ALL" ? (
          <div className="text-center py-12 border rounded-lg bg-gray-50">
            <p className="text-gray-500">No boards match your filters</p>
          </div>
        ) : (
          <div className="text-center py-20 border rounded-xl bg-gray-50">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-orange-400" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Vergo</h2>
            <p className="text-gray-500 mb-1 max-w-md mx-auto">
              Boards help you organize tasks by project or time period.
            </p>
            <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
              Create your first board to start tracking tasks, sending requests, and collecting documents.
            </p>
            {canManageBoards && (
            <Button
              size="lg"
              onClick={() => setIsCreateBoardOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Board
            </Button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-6">
          {/* Column Headers */}
          <div className="flex items-center gap-4 px-4 py-2 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
            {visibleColumns.map((col) => (
              <div key={col.id} className="flex-shrink-0" style={{ width: col.width }}>
                {col.label}
              </div>
            ))}
            <div className="flex-shrink-0">Tasks</div>
            <div className="flex-shrink-0 w-6" />
            <div className="flex-shrink-0 w-8" />
          </div>

          {/* Recurring Boards Section */}
          {recurringBoards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 pb-2">
                <div className="h-1 w-1 rounded-full bg-blue-500" />
                <h3 className="text-sm font-medium text-gray-700">Recurring</h3>
                <span className="text-xs text-gray-400">{recurringBoards.length}</span>
              </div>
              {recurringBoards.map((board) => (
                <BoardRow
                  key={board.id}
                  board={board}
                  menuOpenId={menuOpenId}
                  menuRef={menuRef}
                  visibleColumns={visibleColumns}
                  columns={columns}
                  onColumnsChange={handleColumnsChange}
                  setMenuOpenId={setMenuOpenId}
                  setEditingBoard={setEditingBoard}
                  handleStatusChange={handleStatusChange}
                  handleDuplicateBoard={handleDuplicateBoard}
                  handleArchiveBoard={handleArchiveBoard}
                  handleRestoreBoard={handleRestoreBoard}
                  handleDeleteBoard={handleDeleteBoard}
                  canDeleteBoard={canDeleteBoard}
                  canManageBoards={canManageBoards}
                  canEditColumns={canEditColumns}
                  onBoardUpdate={handleBoardUpdate}
                  organizationTimezone={organizationTimezone}
                  router={router}
                />
              ))}
            </div>
          )}

          {/* Ad Hoc Boards Section */}
          {adHocBoards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 pb-2">
                <div className="h-1 w-1 rounded-full bg-gray-400" />
                <h3 className="text-sm font-medium text-gray-700">Ad Hoc</h3>
                <span className="text-xs text-gray-400">{adHocBoards.length}</span>
              </div>
              {adHocBoards.map((board) => (
                <BoardRow
                  key={board.id}
                  board={board}
                  menuOpenId={menuOpenId}
                  menuRef={menuRef}
                  visibleColumns={visibleColumns}
                  columns={columns}
                  onColumnsChange={handleColumnsChange}
                  setMenuOpenId={setMenuOpenId}
                  setEditingBoard={setEditingBoard}
                  handleStatusChange={handleStatusChange}
                  handleDuplicateBoard={handleDuplicateBoard}
                  handleArchiveBoard={handleArchiveBoard}
                  handleRestoreBoard={handleRestoreBoard}
                  handleDeleteBoard={handleDeleteBoard}
                  canDeleteBoard={canDeleteBoard}
                  canManageBoards={canManageBoards}
                  canEditColumns={canEditColumns}
                  onBoardUpdate={handleBoardUpdate}
                  organizationTimezone={organizationTimezone}
                  router={router}
                />
              ))}
            </div>
          )}

          {/* Complete Boards Section */}
          {completeBoards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 pb-2">
                <div className="h-1 w-1 rounded-full bg-green-500" />
                <h3 className="text-sm font-medium text-gray-700">Complete</h3>
                <span className="text-xs text-gray-400">{completeBoards.length}</span>
              </div>
              {completeBoards.map((board) => (
                <BoardRow
                  key={board.id}
                  board={board}
                  menuOpenId={menuOpenId}
                  menuRef={menuRef}
                  visibleColumns={visibleColumns}
                  columns={columns}
                  onColumnsChange={handleColumnsChange}
                  setMenuOpenId={setMenuOpenId}
                  setEditingBoard={setEditingBoard}
                  handleStatusChange={handleStatusChange}
                  handleDuplicateBoard={handleDuplicateBoard}
                  handleArchiveBoard={handleArchiveBoard}
                  handleRestoreBoard={handleRestoreBoard}
                  handleDeleteBoard={handleDeleteBoard}
                  canDeleteBoard={canDeleteBoard}
                  canManageBoards={canManageBoards}
                  canEditColumns={canEditColumns}
                  onBoardUpdate={handleBoardUpdate}
                  organizationTimezone={organizationTimezone}
                  router={router}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Board Modal */}
      <CreateBoardModal
        open={isCreateBoardOpen}
        onOpenChange={setIsCreateBoardOpen}
        onBoardCreated={(board) => {
          fetchBoards()
          router.push(`/dashboard/jobs?boardId=${board.id}`)
        }}
      />

      {/* Edit Board Modal */}
      <EditBoardModal
        open={!!editingBoard}
        onOpenChange={(open) => !open && setEditingBoard(null)}
        board={editingBoard as any}
        onBoardUpdated={() => {
          fetchBoards()
          setEditingBoard(null)
        }}
        advancedBoardTypes={advancedBoardTypes}
      />

      {/* Archive Board Confirmation */}
      <ConfirmDialog
        open={archiveConfirm.open}
        onOpenChange={(open) => setArchiveConfirm({ open, boardId: open ? archiveConfirm.boardId : null, boardName: open ? archiveConfirm.boardName : "" })}
        title="Archive Board"
        description={`Archive "${archiveConfirm.boardName}"? You can restore it later from the Archived filter.`}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmArchiveBoard}
      />

      {/* Delete Board Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, boardId: open ? deleteConfirm.boardId : null, boardName: open ? deleteConfirm.boardName : "" })}
        title="Delete Board"
        description={`Are you sure you want to permanently delete "${deleteConfirm.boardName}"? This action cannot be undone.`}
        confirmLabel="Delete Board"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteBoard}
      />
    </div>
  )
}

// Extracted BoardRow component for reuse (advanced mode only)
interface BoardRowProps {
  board: Board
  menuOpenId: string | null
  menuRef: React.RefObject<HTMLDivElement>
  visibleColumns: BoardColumnDefinition[]
  columns: BoardColumnDefinition[]
  onColumnsChange: (columns: BoardColumnDefinition[]) => void
  setMenuOpenId: (id: string | null) => void
  setEditingBoard: (board: Board | null) => void
  handleStatusChange: (boardId: string, newStatus: BoardStatus) => void
  handleDuplicateBoard: (board: Board) => void
  handleArchiveBoard: (board: Board) => void
  handleRestoreBoard: (boardId: string) => void
  handleDeleteBoard: (board: Board) => void
  canDeleteBoard: (board: Board) => boolean
  canManageBoards: boolean
  canEditColumns: boolean
  onBoardUpdate: (updatedBoard: Board) => void
  organizationTimezone: string
  router: ReturnType<typeof useRouter>
}

function BoardRow({
  board,
  menuOpenId,
  menuRef,
  visibleColumns,
  columns,
  onColumnsChange,
  setMenuOpenId,
  setEditingBoard,
  handleStatusChange,
  handleDuplicateBoard,
  handleArchiveBoard,
  handleRestoreBoard,
  handleDeleteBoard,
  canDeleteBoard,
  canManageBoards,
  canEditColumns,
  onBoardUpdate,
  organizationTimezone,
  router
}: BoardRowProps) {
  const getColumnWidth = (columnId: string): number => {
    const column = columns.find(c => c.id === columnId)
    return column?.width || 120
  }

  const renderColumnValue = (columnId: string) => {
    const width = getColumnWidth(columnId)

    switch (columnId) {
      case "name":
        return (
          <div className="flex-shrink-0 min-w-0 truncate" style={{ width }}>
            <span className="text-sm font-medium text-gray-900 truncate block">{board.name}</span>
          </div>
        )
      case "cadence":
        return (
          <div className="flex-shrink-0" style={{ width }}>
            {getCadenceBadge(board.cadence)}
          </div>
        )
      case "period":
        return (
          <div className="text-sm text-gray-600 flex-shrink-0" style={{ width }}>
            {formatPeriod(board.periodStart, board.periodEnd, board.cadence, organizationTimezone)}
          </div>
        )
      case "status":
        return (
          <div className="flex-shrink-0" style={{ width }}>
            {getStatusBadge(board.status)}
          </div>
        )
      case "owner":
        return (
          <div className="flex-shrink-0" style={{ width }}>
            {board.owner ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs bg-orange-100 text-orange-700">
                    {getInitials(board.owner.name, board.owner.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-gray-700 truncate">
                  {board.owner.name || board.owner.email.split("@")[0]}
                </span>
              </div>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        )
      case "updatedAt":
        return (
          <div className="text-sm text-gray-500 flex-shrink-0" style={{ width }}>
            {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div
      className="hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100"
      onClick={() => router.push(`/dashboard/jobs?boardId=${board.id}`)}
    >
      {/* Board Row */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Render visible columns */}
        {visibleColumns.map((column) => (
          <div key={column.id}>
            {renderColumnValue(column.id)}
          </div>
        ))}

        {/* Task count indicator */}
        <div className="flex-shrink-0 text-sm text-gray-500">
          {board.taskInstanceCount || 0} tasks
        </div>

        {/* Column Settings */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <BoardColumnHeader
            columns={columns}
            onColumnsChange={onColumnsChange}
            canEditColumns={canEditColumns}
          />
        </div>

        {/* Actions */}
        {canManageBoards && (
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpenId(menuOpenId === board.id ? null : board.id)
            }}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-500" />
          </button>

          {/* Context menu */}
          {menuOpenId === board.id && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1 w-48 bg-white border rounded-lg shadow-lg z-50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Edit */}
              <button
                onClick={() => {
                  setEditingBoard(board)
                  setMenuOpenId(null)
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>

              <div className="border-t my-1" />

              {/* Quick status actions */}
              {normalizeStatus(board.status) !== "IN_PROGRESS" && normalizeStatus(board.status) !== "ARCHIVED" && (
                <button
                  onClick={() => handleStatusChange(board.id, "IN_PROGRESS")}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
                >
                  <PlayCircle className="w-4 h-4" />
                  Mark In Progress
                </button>
              )}

              {normalizeStatus(board.status) !== "COMPLETE" && normalizeStatus(board.status) !== "ARCHIVED" && (
                <button
                  onClick={() => handleStatusChange(board.id, "COMPLETE")}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-green-600"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Complete
                </button>
              )}

              {normalizeStatus(board.status) !== "BLOCKED" && normalizeStatus(board.status) !== "ARCHIVED" && (
                <button
                  onClick={() => handleStatusChange(board.id, "BLOCKED")}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                >
                  <PauseCircle className="w-4 h-4" />
                  Mark Blocked
                </button>
              )}

              <div className="border-t my-1" />

              <button
                onClick={() => handleDuplicateBoard(board)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>

              {normalizeStatus(board.status) === "ARCHIVED" ? (
                <button
                  onClick={() => handleRestoreBoard(board.id)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-green-600"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => handleArchiveBoard(board)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
              )}

              {canDeleteBoard(board) && (
                <button
                  onClick={() => handleDeleteBoard(board)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
