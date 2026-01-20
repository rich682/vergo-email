"use client"

import { useState, useEffect, useRef } from "react"
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
  Loader2
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { CreateBoardModal } from "@/components/boards/create-board-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Board {
  id: string
  name: string
  status: "OPEN" | "CLOSED" | "ARCHIVED"
  jobCount: number
  updatedAt: string
  createdAt: string
}

type StatusFilter = "OPEN" | "CLOSED" | "ARCHIVED" | "ALL"
type SortOption = "recent" | "name"

export default function BoardsPage() {
  const router = useRouter()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN")
  const [sortOption, setSortOption] = useState<SortOption>("recent")
  
  // Modal states
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false)
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
  const filteredBoards = boards
    .filter(board => {
      // Status filter
      if (statusFilter !== "ALL" && board.status !== statusFilter) {
        return false
      }
      // Search filter
      if (searchQuery && !board.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortOption === "name") {
        return a.name.localeCompare(b.name)
      }
      // Default: most recent
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

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
        body: JSON.stringify({ status: "OPEN" })
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
          duplicateFromId: board.id
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

  const canDeleteBoard = (board: Board): boolean => {
    return (board.jobCount || 0) === 0
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Open</span>
      case "CLOSED":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Closed</span>
      case "ARCHIVED":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Archived</span>
      default:
        return null
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Boards</h1>
          <p className="text-gray-500 mt-1">Organize your tasks by period or project</p>
        </div>
        <Button onClick={() => setIsCreateBoardOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Board
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search boards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
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
            {searchQuery || statusFilter !== "OPEN" 
              ? "No boards match your filters" 
              : "No boards yet. Create your first board to get started."}
          </p>
          {!searchQuery && statusFilter === "OPEN" && (
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
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Board Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasks
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBoards.map((board) => (
                <tr 
                  key={board.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/dashboard/jobs?boardId=${board.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{board.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(board.status)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {board.jobCount}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">
                    {formatDistanceToNow(new Date(board.updatedAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3 text-right relative">
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
                        className="absolute right-4 top-full mt-1 w-44 bg-white border rounded-lg shadow-lg z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDuplicateBoard(board)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </button>
                        
                        {board.status === "ARCHIVED" ? (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
