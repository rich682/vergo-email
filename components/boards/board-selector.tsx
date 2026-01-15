"use client"

import { useState, useEffect, useRef } from "react"
import { Check, ChevronDown, Plus, LayoutGrid, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Board {
  id: string
  name: string
  status: "OPEN" | "CLOSED" | "ARCHIVED"
  jobCount?: number
  _count?: { jobs: number }
}

interface BoardSelectorProps {
  selectedBoardId: string | null
  onSelectBoard: (boardId: string | null) => void
  onCreateBoard?: () => void
  className?: string
}

export function BoardSelector({
  selectedBoardId,
  onSelectBoard,
  onCreateBoard,
  className = ""
}: BoardSelectorProps) {
  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchBoards()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchBoards = async () => {
    try {
      const response = await fetch("/api/boards")
      if (response.ok) {
        const data = await response.json()
        // Filter to only show OPEN and CLOSED boards (not ARCHIVED)
        const activeBoards = (data.boards || []).filter(
          (b: Board) => b.status === "OPEN" || b.status === "CLOSED"
        )
        setBoards(activeBoards)
      }
    } catch (error) {
      console.error("Error fetching boards:", error)
    } finally {
      setLoading(false)
    }
  }

  const selectedBoard = boards.find(b => b.id === selectedBoardId)
  
  const filteredBoards = boards.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  const getJobCount = (board: Board) => {
    return board.jobCount ?? board._count?.jobs ?? 0
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        className="w-[200px] justify-between"
      >
        <div className="flex items-center gap-2 truncate">
          <LayoutGrid className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="truncate">
            {selectedBoard ? selectedBoard.name : "All Tasks"}
          </span>
        </div>
        <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[240px] bg-white border rounded-lg shadow-lg z-50">
          {/* Search */}
          <div className="p-2 border-b">
            <input
              type="text"
              placeholder="Search boards..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {/* All Tasks option */}
                <button
                  onClick={() => {
                    onSelectBoard(null)
                    setOpen(false)
                    setSearch("")
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Check className={`w-4 h-4 ${!selectedBoardId ? "text-blue-600" : "text-transparent"}`} />
                  <span className="font-medium">All Tasks</span>
                </button>

                {/* Divider */}
                {filteredBoards.length > 0 && <div className="border-t my-1" />}

                {/* Boards */}
                {filteredBoards.length > 0 && (
                  <div className="py-1">
                    <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase">
                      Boards
                    </div>
                    {filteredBoards.map((board) => (
                      <button
                        key={board.id}
                        onClick={() => {
                          onSelectBoard(board.id)
                          setOpen(false)
                          setSearch("")
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Check className={`w-4 h-4 ${selectedBoardId === board.id ? "text-blue-600" : "text-transparent"}`} />
                        <span className="truncate flex-1">{board.name}</span>
                        <span className="text-xs text-gray-400">
                          {getJobCount(board)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* No results */}
                {search && filteredBoards.length === 0 && (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No boards found
                  </div>
                )}

                {/* Create new board */}
                {onCreateBoard && (
                  <>
                    <div className="border-t my-1" />
                    <button
                      onClick={() => {
                        setOpen(false)
                        setSearch("")
                        onCreateBoard()
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create new board</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
