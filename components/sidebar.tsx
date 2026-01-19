"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, Archive, Trash2, Copy, Calendar } from "lucide-react"
import { CreateBoardModal } from "@/components/boards/create-board-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface SidebarProps {
  className?: string
  userRole?: string  // User's role for showing/hiding admin items
}

// Custom icons matching Vergo style (outline, thin strokes)
function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function RequestsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  )
}

function CollectionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  )
}

function ContactsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function BoardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  )
}

interface Board {
  id: string
  name: string
  status: "OPEN" | "CLOSED" | "ARCHIVED"
  jobCount: number
  _count?: {
    jobs?: number
  }
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// Core workflow nav items (excluding Tasks and Collection which have their own expandable sections)
const coreNavItems: NavItem[] = [
  {
    href: "/dashboard/requests",
    label: "Requests",
    icon: RequestsIcon
  },
]

// Settings/management nav items (shown at bottom)
const settingsNavItems: NavItem[] = [
  { 
    href: "/dashboard/contacts", 
    label: "Contacts", 
    icon: ContactsIcon 
  },
  { 
    href: "/dashboard/settings/team", 
    label: "Team", 
    icon: TeamIcon 
  },
  { 
    href: "/dashboard/settings", 
    label: "Settings", 
    icon: SettingsIcon 
  },
]

export function Sidebar({ className = "", userRole }: SidebarProps) {
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [collectionExpanded, setCollectionExpanded] = useState(true)
  const [archivedExpanded, setArchivedExpanded] = useState(false)
  
  // Check if user is admin
  const isAdmin = userRole?.toUpperCase() === "ADMIN"
  const [boards, setBoards] = useState<Board[]>([])
  const [archivedBoards, setArchivedBoards] = useState<Board[]>([])
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false)
  const [boardMenuOpen, setBoardMenuOpen] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; boardId: string | null; boardName: string }>({ open: false, boardId: null, boardName: "" })
  const [archiveConfirm, setArchiveConfirm] = useState<{ open: boolean; boardId: string | null; boardName: string }>({ open: false, boardId: null, boardName: "" })
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Get current boardId from URL
  const currentBoardId = searchParams.get("boardId")

  // Fetch active boards for sidebar
  const fetchBoards = async () => {
    try {
      const response = await fetch("/api/boards?status=OPEN,CLOSED")
      if (response.ok) {
        const data = await response.json()
        setBoards(data.boards || [])
      }
    } catch (error) {
      console.error("Error fetching boards:", error)
    }
  }

  // Fetch archived boards
  const fetchArchivedBoards = async () => {
    try {
      const response = await fetch("/api/boards?status=ARCHIVED")
      if (response.ok) {
        const data = await response.json()
        setArchivedBoards(data.boards || [])
      }
    } catch (error) {
      console.error("Error fetching archived boards:", error)
    }
  }

  useEffect(() => {
    fetchBoards()
    fetchArchivedBoards()
  }, [])

  // Close board menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(event.target as Node)) {
        setBoardMenuOpen(null)
      }
    }
    
    if (boardMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [boardMenuOpen])

  // Check if we're on the tasks page
  const isOnTasksPage = pathname === "/dashboard/jobs" || pathname.startsWith("/dashboard/jobs/")
  
  // Check if we're on the collection page
  const isOnCollectionPage = pathname === "/dashboard/collection" || pathname.startsWith("/dashboard/collection/")

  // Handle board actions
  const handleArchiveBoard = (boardId: string) => {
    // Find the board name for the confirmation message
    const board = boards.find(b => b.id === boardId)
    const boardName = board?.name || "this board"
    setArchiveConfirm({ open: true, boardId, boardName })
    setBoardMenuOpen(null)
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
        fetchArchivedBoards()
        if (currentBoardId === archiveConfirm.boardId) {
          router.push("/dashboard/jobs")
        }
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
        fetchArchivedBoards()
        setBoardMenuOpen(null)
      }
    } catch (error) {
      console.error("Error restoring board:", error)
    }
  }

  const handleDeleteBoard = async (boardId: string) => {
    // Open confirmation dialog instead of using window.confirm
    const board = boards.find(b => b.id === boardId) || archivedBoards.find(b => b.id === boardId)
    const boardName = board?.name || "this board"
    setDeleteConfirm({ open: true, boardId, boardName })
    setBoardMenuOpen(null)
  }

  const confirmDeleteBoard = async () => {
    if (!deleteConfirm.boardId) return
    try {
      const response = await fetch(`/api/boards/${deleteConfirm.boardId}?hard=true`, {
        method: "DELETE"
      })
      if (response.ok) {
        fetchBoards()
        fetchArchivedBoards()
        if (currentBoardId === deleteConfirm.boardId) {
          router.push("/dashboard/jobs")
        }
      }
    } catch (error) {
      console.error("Error deleting board:", error)
    }
    setDeleteConfirm({ open: false, boardId: null, boardName: "" })
  }

  // Check if board can be deleted (only if no tasks)
  const canDeleteBoard = (board: Board): boolean => {
    return (board.jobCount || 0) === 0
  }

  const handleDuplicateBoard = async (boardId: string) => {
    const board = boards.find(b => b.id === boardId)
    if (!board) return
    
    try {
      // Create a new board with the same name + (Copy)
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${board.name} (Copy)`,
          duplicateFromId: boardId
        })
      })
      if (response.ok) {
        const data = await response.json()
        fetchBoards()
        setBoardMenuOpen(null)
        router.push(`/dashboard/jobs?boardId=${data.board.id}`)
      }
    } catch (error) {
      console.error("Error duplicating board:", error)
    }
  }

  return (
    <>
      <div
        className={`
          fixed left-0 top-0 h-full bg-white border-r border-gray-100 z-40
          flex flex-col w-64
          ${className}
        `}
      >
        {/* Logo */}
        <div className="h-20 flex items-center px-5">
          <Link href="/dashboard/jobs" className="flex items-center">
            <img 
              src="/logo.svg" 
              alt="Vergo" 
              className="h-8 w-auto"
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 pt-4 overflow-y-auto flex flex-col">
          {/* Core Workflow Section */}
          <ul className="space-y-1">
            {/* Tasks Section - Expandable with Boards */}
            <li>
              {/* Tasks Header */}
              <button
                onClick={() => setTasksExpanded(!tasksExpanded)}
                className={`
                  w-full flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                  transition-all duration-150
                  ${isOnTasksPage && !currentBoardId
                    ? "bg-gray-100 text-gray-900" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }
                `}
                style={{ width: "calc(100% - 24px)" }}
              >
                <TasksIcon className="w-6 h-6 flex-shrink-0" />
                <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                  {UI_LABELS.jobsNavLabel}
                </span>
                {tasksExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Boards Sub-items */}
              {tasksExpanded && (
                <ul className="mt-1 ml-6 space-y-0.5">
                  {/* Board Items */}
                  {boards.map((board) => {
                    const isActiveBoard = currentBoardId === board.id
                    return (
                      <li key={board.id} className="relative group">
                        <Link
                          href={`/dashboard/jobs?boardId=${board.id}`}
                          className={`
                            flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                            transition-all duration-150
                            ${isActiveBoard
                              ? "bg-blue-50 text-blue-700 font-medium" 
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                            }
                          `}
                        >
                          <BoardIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate flex-1">{board.name}</span>
                          <span className="text-xs text-gray-400">{board.jobCount}</span>
                        </Link>
                        
                        {/* Board context menu trigger */}
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setBoardMenuOpen(boardMenuOpen === board.id ? null : board.id)
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4 text-gray-500" />
                        </button>

                        {/* Board context menu */}
                        {boardMenuOpen === board.id && (
                          <div 
                            ref={boardMenuRef}
                            className="absolute right-0 top-full mt-1 w-40 bg-white border rounded-lg shadow-lg z-50"
                          >
                            <button
                              onClick={() => handleDuplicateBoard(board.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Copy className="w-4 h-4" />
                              Duplicate
                            </button>
                            <button
                              onClick={() => handleArchiveBoard(board.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Archive className="w-4 h-4" />
                              Archive
                            </button>
                            {/* Only show delete if board has no tasks */}
                            {canDeleteBoard(board) && (
                              <button
                                onClick={() => handleDeleteBoard(board.id)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}

                  {/* Divider before New Board */}
                  <li className="mx-6 my-2">
                    <div className="border-t border-gray-200" />
                  </li>

                  {/* New Board Button */}
                  <li>
                    <button
                      onClick={() => setIsCreateBoardOpen(true)}
                      className="
                        flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                        text-gray-500 hover:bg-gray-50 hover:text-gray-700
                        transition-all duration-150
                      "
                      style={{ width: "calc(100% - 24px)" }}
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      <span>New Board</span>
                    </button>
                  </li>

                  {/* Archived Boards Section */}
                  {archivedBoards.length > 0 && (
                    <>
                      <li className="mx-6 my-2">
                        <div className="border-t border-gray-200" />
                      </li>
                      <li>
                        <button
                          onClick={() => setArchivedExpanded(!archivedExpanded)}
                          className="
                            flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                            text-gray-400 hover:bg-gray-50 hover:text-gray-600
                            transition-all duration-150 w-full
                          "
                          style={{ width: "calc(100% - 24px)" }}
                        >
                          <Archive className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1 text-left">Archived</span>
                          <span className="text-xs text-gray-400">{archivedBoards.length}</span>
                          {archivedExpanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                      </li>
                      
                      {archivedExpanded && archivedBoards.map((board) => (
                        <li key={board.id} className="relative group">
                          <div
                            className="
                              flex items-center gap-3 mx-3 ml-6 px-3 py-2 rounded-lg text-sm
                              text-gray-400
                            "
                          >
                            <BoardIcon className="w-4 h-4 flex-shrink-0 opacity-50" />
                            <span className="truncate flex-1">{board.name}</span>
                          </div>
                          
                          {/* Archived board context menu trigger */}
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setBoardMenuOpen(boardMenuOpen === `archived-${board.id}` ? null : `archived-${board.id}`)
                            }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4 text-gray-400" />
                          </button>

                          {/* Archived board context menu */}
                          {boardMenuOpen === `archived-${board.id}` && (
                            <div 
                              ref={boardMenuRef}
                              className="absolute right-0 top-full mt-1 w-40 bg-white border rounded-lg shadow-lg z-50"
                            >
                              <button
                                onClick={() => handleRestoreBoard(board.id)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-green-600"
                              >
                                <Archive className="w-4 h-4" />
                                Restore
                              </button>
                              {/* Only show delete if board has no tasks */}
                              {canDeleteBoard(board) && (
                                <button
                                  onClick={() => handleDeleteBoard(board.id)}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </>
                  )}
                </ul>
              )}
            </li>

            {/* Core Nav Items (Requests) */}
            {coreNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              const Icon = item.icon
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                      transition-all duration-150
                      ${isActive 
                        ? "bg-gray-100 text-gray-900" 
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      }
                    `}
                    style={{ width: "calc(100% - 24px)" }}
                  >
                    <Icon className="w-6 h-6 flex-shrink-0" />
                    <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                      {item.label}
                    </span>
                  </Link>
                </li>
              )
            })}

            {/* Collection Section - Expandable */}
            <li>
              {/* Collection Header */}
              <button
                onClick={() => setCollectionExpanded(!collectionExpanded)}
                className={`
                  w-full flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                  transition-all duration-150
                  ${isOnCollectionPage
                    ? "bg-gray-100 text-gray-900" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }
                `}
                style={{ width: "calc(100% - 24px)" }}
              >
                <CollectionIcon className="w-6 h-6 flex-shrink-0" />
                <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                  Collection
                </span>
                {collectionExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Collection Sub-items */}
              {collectionExpanded && (
                <ul className="mt-1 ml-6 space-y-0.5">
                  {/* Documents */}
                  <li>
                    <Link
                      href="/dashboard/collection"
                      className={`
                        flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                        transition-all duration-150
                        ${isOnCollectionPage
                          ? "bg-blue-50 text-blue-700 font-medium" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                        }
                      `}
                    >
                      <DocumentIcon className="w-4 h-4 flex-shrink-0" />
                      <span>Documents</span>
                    </Link>
                  </li>
                  
                  {/* Future: Expenses, Invoices, etc. will go here */}
                </ul>
              )}
            </li>
          </ul>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Onboarding Call CTA */}
          <div className="mx-3 mb-3">
            <a
              href="https://calendly.com/vergo-ai/vergo-onboarding-call"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-all duration-150"
            >
              <Calendar className="w-5 h-5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Book Onboarding</span>
                <span className="text-xs text-orange-500">Schedule a call</span>
              </div>
            </a>
          </div>

          {/* Settings/Management Section (Bottom) */}
          <ul className="space-y-1 pb-4 border-t border-gray-100 pt-4 mt-4">
            {settingsNavItems
              // Filter out Team and Settings for non-admins
              .filter((item) => {
                if (!isAdmin && (item.href === "/dashboard/settings/team" || item.href === "/dashboard/settings")) {
                  return false
                }
                return true
              })
              .map((item) => {
              let isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              if (item.href === "/dashboard/settings" && pathname.startsWith("/dashboard/settings/team")) {
                isActive = false
              }
              const Icon = item.icon
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                      transition-all duration-150
                      ${isActive 
                        ? "bg-gray-100 text-gray-900" 
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      }
                    `}
                  >
                    <Icon className="w-6 h-6 flex-shrink-0" />
                    <span className="text-base font-normal whitespace-nowrap">
                      {item.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>

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
        description={`Archive "${archiveConfirm.boardName}"? Archived boards are hidden from the sidebar but can be restored later.`}
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
    </>
  )
}
