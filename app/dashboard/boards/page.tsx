"use client"

import { useState, useEffect, useRef, useMemo } from "react"
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
  ChevronRight,
  ChevronDown,
  Calendar
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { CreateBoardModal } from "@/components/boards/create-board-modal"
import { EditBoardModal } from "@/components/boards/edit-board-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

// Types
type BoardStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "ARCHIVED" | "OPEN" | "CLOSED"
type BoardCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC"
type JobStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "STUCK" | "ACTIVE" | "WAITING" | "COMPLETED" | "ARCHIVED"

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

interface JobOwner {
  id: string
  name: string | null
  email: string
}

interface Job {
  id: string
  name: string
  description: string | null
  status: JobStatus
  dueDate: string | null
  owner: JobOwner
  _count?: {
    tasks: number
    subtasks: number
  }
}

interface Board {
  id: string
  name: string
  status: BoardStatus
  cadence: BoardCadence | null
  periodStart: string | null
  periodEnd: string | null
  jobCount: number
  owner: BoardOwner | null
  collaborators: BoardCollaborator[]
  updatedAt: string
  createdAt: string
  jobs?: Job[] // Populated when expanded
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
  if (status === "CLOSED") return "COMPLETE"
  return status
}

function normalizeJobStatus(status: JobStatus): string {
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

function getStatusBadge(status: BoardStatus) {
  const normalized = normalizeStatus(status)
  switch (normalized) {
    case "NOT_STARTED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Not Started</span>
    case "IN_PROGRESS":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">In Progress</span>
    case "COMPLETE":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Complete</span>
    case "BLOCKED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Blocked</span>
    case "ARCHIVED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Archived</span>
    default:
      return null
  }
}

function getJobStatusBadge(status: JobStatus) {
  const normalized = normalizeJobStatus(status)
  switch (normalized) {
    case "NOT_STARTED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">Not Started</span>
    case "IN_PROGRESS":
      return <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">In Progress</span>
    case "COMPLETE":
      return <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">Complete</span>
    case "BLOCKED":
      return <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">Blocked</span>
    case "STUCK":
      return <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">Stuck</span>
    default:
      return <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">{status}</span>
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

function formatPeriod(periodStart: string | null, periodEnd: string | null, cadence: BoardCadence | null): string {
  if (!periodStart) return "—"
  
  const start = new Date(periodStart)
  
  switch (cadence) {
    case "MONTHLY":
      return format(start, "MMMM yyyy")
    case "WEEKLY":
      return `Week of ${format(start, "MMM d, yyyy")}`
    case "QUARTERLY":
      const q = Math.floor(start.getMonth() / 3) + 1
      return `Q${q} ${start.getFullYear()}`
    case "YEAR_END":
      return start.getFullYear().toString()
    case "DAILY":
      return format(start, "MMM d, yyyy")
    default:
      if (periodEnd) {
        return `${format(start, "MMM d")} - ${format(new Date(periodEnd), "MMM d, yyyy")}`
      }
      return format(start, "MMM d, yyyy")
  }
}

const STATUS_ORDER: Record<BoardStatus, number> = {
  IN_PROGRESS: 1,
  NOT_STARTED: 2,
  BLOCKED: 3,
  COMPLETE: 4,
  ARCHIVED: 5,
  OPEN: 2, // Legacy - treat as NOT_STARTED
  CLOSED: 4, // Legacy - treat as COMPLETE
}

export default function BoardsPage() {
  const router = useRouter()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>("ALL")
  const [sortOption, setSortOption] = useState<SortOption>("recent")
  
  // Expanded boards state
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(new Set())
  const [loadingJobs, setLoadingJobs] = useState<Set<string>>(new Set())
  const [boardJobs, setBoardJobs] = useState<Record<string, Job[]>>({})
  
  // Modal states
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<{ open: boolean; boardId: string | null; boardName: string }>({ open: false, boardId: null, boardName: "" })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; boardId: string | null; boardName: string }>({ open: false, boardId: null, boardName: "" })
  
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch all boards
  const fetchBoards = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/boards")
      if (response.ok) {
        const data = await response.json()
        setBoards(data.boards || [])
      }
    } catch (error) {
      console.error("Error fetching boards:", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch jobs for a specific board
  const fetchBoardJobs = async (boardId: string) => {
    if (boardJobs[boardId]) return // Already loaded
    
    setLoadingJobs(prev => new Set(prev).add(boardId))
    try {
      const response = await fetch(`/api/boards/${boardId}?includeJobs=true`)
      if (response.ok) {
        const data = await response.json()
        setBoardJobs(prev => ({
          ...prev,
          [boardId]: data.board.jobs || []
        }))
      }
    } catch (error) {
      console.error("Error fetching board jobs:", error)
    } finally {
      setLoadingJobs(prev => {
        const next = new Set(prev)
        next.delete(boardId)
        return next
      })
    }
  }

  // Toggle board expansion
  const toggleBoardExpansion = async (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (expandedBoards.has(boardId)) {
      setExpandedBoards(prev => {
        const next = new Set(prev)
        next.delete(boardId)
        return next
      })
    } else {
      setExpandedBoards(prev => new Set(prev).add(boardId))
      fetchBoardJobs(boardId)
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

  // Filter and sort boards
  const filteredBoards = useMemo(() => {
    return boards
      .filter(board => {
        // Status filter
        if (statusFilter !== "ALL") {
          const normalized = normalizeStatus(board.status)
          if (normalized !== statusFilter) {
            return false
          }
        } else {
          // By default, hide archived unless explicitly requested
          if (normalizeStatus(board.status) === "ARCHIVED") {
            return false
          }
        }
        
        // Cadence filter
        if (cadenceFilter !== "ALL" && board.cadence !== cadenceFilter) {
          return false
        }
        
        // Search filter
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
            // Sort by periodStart, null last
            if (!a.periodStart && !b.periodStart) return 0
            if (!a.periodStart) return 1
            if (!b.periodStart) return -1
            return new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime()
          case "status":
            return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          default: // recent
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }
      })
  }, [boards, statusFilter, cadenceFilter, searchQuery, sortOption])

  // Split boards into recurring and ad hoc
  const { recurringBoards, adHocBoards } = useMemo(() => {
    const recurring: Board[] = []
    const adHoc: Board[] = []
    
    filteredBoards.forEach(board => {
      if (board.cadence === "AD_HOC" || !board.cadence) {
        adHoc.push(board)
      } else {
        recurring.push(board)
      }
    })
    
    return { recurringBoards: recurring, adHocBoards: adHoc }
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
    return (board.jobCount || 0) === 0
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Boards</h1>
          <p className="text-gray-500 mt-1">Organize your tasks by time period</p>
        </div>
        <Button onClick={() => setIsCreateBoardOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Board
        </Button>
      </div>

      {/* Filters */}
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
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filteredBoards.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-gray-50">
          <p className="text-gray-500">
            {searchQuery || statusFilter !== "ALL" || cadenceFilter !== "ALL"
              ? "No boards match your filters" 
              : "No boards yet. Create your first board to get started."}
          </p>
          {!searchQuery && statusFilter === "ALL" && cadenceFilter === "ALL" && (
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setIsCreateBoardOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Board
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Recurring Boards Section */}
          {recurringBoards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 pb-2">
                <div className="h-1 w-1 rounded-full bg-blue-500" />
                <h3 className="text-sm font-medium text-gray-700">Recurring</h3>
                <span className="text-xs text-gray-400">{recurringBoards.length}</span>
              </div>
              {recurringBoards.map((board) => {
                const isExpanded = expandedBoards.has(board.id)
                const isLoadingJobs = loadingJobs.has(board.id)
                const jobs = boardJobs[board.id] || []
                
                return (
                  <BoardRow 
                    key={board.id}
                    board={board}
                    isExpanded={isExpanded}
                    isLoadingJobs={isLoadingJobs}
                    jobs={jobs}
                    menuOpenId={menuOpenId}
                    menuRef={menuRef}
                    toggleBoardExpansion={toggleBoardExpansion}
                    setMenuOpenId={setMenuOpenId}
                    setEditingBoard={setEditingBoard}
                    handleStatusChange={handleStatusChange}
                    handleDuplicateBoard={handleDuplicateBoard}
                    handleArchiveBoard={handleArchiveBoard}
                    handleRestoreBoard={handleRestoreBoard}
                    handleDeleteBoard={handleDeleteBoard}
                    canDeleteBoard={canDeleteBoard}
                    router={router}
                  />
                )
              })}
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
              {adHocBoards.map((board) => {
                const isExpanded = expandedBoards.has(board.id)
                const isLoadingJobs = loadingJobs.has(board.id)
                const jobs = boardJobs[board.id] || []
                
                return (
                  <BoardRow 
                    key={board.id}
                    board={board}
                    isExpanded={isExpanded}
                    isLoadingJobs={isLoadingJobs}
                    jobs={jobs}
                    menuOpenId={menuOpenId}
                    menuRef={menuRef}
                    toggleBoardExpansion={toggleBoardExpansion}
                    setMenuOpenId={setMenuOpenId}
                    setEditingBoard={setEditingBoard}
                    handleStatusChange={handleStatusChange}
                    handleDuplicateBoard={handleDuplicateBoard}
                    handleArchiveBoard={handleArchiveBoard}
                    handleRestoreBoard={handleRestoreBoard}
                    handleDeleteBoard={handleDeleteBoard}
                    canDeleteBoard={canDeleteBoard}
                    router={router}
                  />
                )
              })}
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
        board={editingBoard}
        onBoardUpdated={() => {
          fetchBoards()
          setEditingBoard(null)
        }}
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

// Extracted BoardRow component for reuse
interface BoardRowProps {
  board: Board
  isExpanded: boolean
  isLoadingJobs: boolean
  jobs: Job[]
  menuOpenId: string | null
  menuRef: React.RefObject<HTMLDivElement>
  toggleBoardExpansion: (boardId: string, e: React.MouseEvent) => void
  setMenuOpenId: (id: string | null) => void
  setEditingBoard: (board: Board | null) => void
  handleStatusChange: (boardId: string, newStatus: BoardStatus) => void
  handleDuplicateBoard: (board: Board) => void
  handleArchiveBoard: (board: Board) => void
  handleRestoreBoard: (boardId: string) => void
  handleDeleteBoard: (board: Board) => void
  canDeleteBoard: (board: Board) => boolean
  router: ReturnType<typeof useRouter>
}

function BoardRow({
  board,
  isExpanded,
  isLoadingJobs,
  jobs,
  menuOpenId,
  menuRef,
  toggleBoardExpansion,
  setMenuOpenId,
  setEditingBoard,
  handleStatusChange,
  handleDuplicateBoard,
  handleArchiveBoard,
  handleRestoreBoard,
  handleDeleteBoard,
  canDeleteBoard,
  router
}: BoardRowProps) {
  return (
    <div className="border rounded-lg bg-white">
      {/* Board Header Row */}
      <div 
        className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => router.push(`/dashboard/jobs?boardId=${board.id}`)}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={(e) => toggleBoardExpansion(board.id, e)}
          className="p-1 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
          disabled={board.jobCount === 0}
        >
          {board.jobCount === 0 ? (
            <ChevronRight className="w-4 h-4 text-gray-300" />
          ) : isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* Board Name */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900">{board.name}</span>
        </div>

        {/* Cadence */}
        <div className="w-24 flex-shrink-0">
          {getCadenceBadge(board.cadence)}
        </div>

        {/* Period */}
        <div className="w-36 text-sm text-gray-600 flex-shrink-0">
          {formatPeriod(board.periodStart, board.periodEnd, board.cadence)}
        </div>

        {/* Status */}
        <div className="w-28 flex-shrink-0">
          {getStatusBadge(board.status)}
        </div>

        {/* Owner */}
        <div className="w-32 flex-shrink-0">
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

        {/* Tasks Count */}
        <div className="w-16 text-center text-gray-600 flex-shrink-0">
          {board.jobCount}
        </div>

        {/* Updated */}
        <div className="w-28 text-sm text-gray-500 flex-shrink-0">
          {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}
        </div>

        {/* Actions */}
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
      </div>

      {/* Expanded Jobs Section */}
      {isExpanded && (
        <div className="border-t">
          {isLoadingJobs ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-4 px-6 text-center text-gray-500 text-sm">
              No tasks in this board yet
            </div>
          ) : (
            <div className="py-2">
              {/* Jobs Header */}
              <div className="flex items-center gap-4 px-6 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <div className="w-6"></div> {/* Indent spacer */}
                <div className="flex-1 min-w-0">Item</div>
                <div className="w-32">Person</div>
                <div className="w-28">Status</div>
                <div className="w-28">Date</div>
                <div className="w-12"></div>
              </div>
              
              {/* Jobs List */}
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-6 py-2.5 hover:bg-gray-100 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/dashboard/jobs/${job.id}`)
                  }}
                >
                  <div className="w-6"></div> {/* Indent spacer */}
                  
                  {/* Task Name */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900 truncate block">{job.name}</span>
                  </div>

                  {/* Owner */}
                  <div className="w-32 flex-shrink-0">
                    {job.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                            {getInitials(job.owner.name, job.owner.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-gray-700 truncate">
                          {job.owner.name || job.owner.email.split("@")[0]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-28 flex-shrink-0">
                    {getJobStatusBadge(job.status)}
                  </div>

                  {/* Due Date */}
                  <div className="w-28 flex-shrink-0">
                    {job.dueDate ? (
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="w-3.5 h-3.5" />
                        {format(new Date(job.dueDate), "MMM d")}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </div>

                  {/* Spacer for alignment with board row */}
                  <div className="w-12"></div>
                </div>
              ))}
              
              {/* Add Task Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/dashboard/jobs?boardId=${board.id}&action=create`)
                }}
                className="w-full flex items-center gap-2 px-6 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <div className="w-6"></div>
                <Plus className="w-4 h-4" />
                <span>Add item</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
