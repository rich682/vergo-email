"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, Pencil, Archive, Trash2 } from "lucide-react"
import { CreateBoardModal } from "@/components/boards/create-board-modal"

interface SidebarProps {
  className?: string
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

interface Board {
  id: string
  name: string
  status: "OPEN" | "CLOSED" | "ARCHIVED"
  jobCount: number
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// Non-Tasks nav items
const otherNavItems: NavItem[] = [
  {
    href: "/dashboard/requests",
    label: "Requests",
    icon: RequestsIcon
  },
  {
    href: "/dashboard/collection",
    label: "Collection",
    icon: CollectionIcon
  },
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

export function Sidebar({ className = "" }: SidebarProps) {
  const [expanded, setExpanded] = useState(false)
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [boards, setBoards] = useState<Board[]>([])
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false)
  const [boardMenuOpen, setBoardMenuOpen] = useState<string | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Get current boardId from URL
  const currentBoardId = searchParams.get("boardId")

  // Fetch boards for sidebar
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

  useEffect(() => {
    fetchBoards()
  }, [])

  // Check if we're on the tasks page
  const isOnTasksPage = pathname === "/dashboard/jobs" || pathname.startsWith("/dashboard/jobs/")

  // Handle board actions
  const handleArchiveBoard = async (boardId: string) => {
    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" })
      })
      if (response.ok) {
        fetchBoards()
        setBoardMenuOpen(null)
        // If we're viewing this board, go to all tasks
        if (currentBoardId === boardId) {
          router.push("/dashboard/jobs")
        }
      }
    } catch (error) {
      console.error("Error archiving board:", error)
    }
  }

  const handleDeleteBoard = async (boardId: string) => {
    if (!window.confirm("Delete this board? Tasks will be moved to 'All Tasks'.")) return
    try {
      const response = await fetch(`/api/boards/${boardId}?hard=true`, {
        method: "DELETE"
      })
      if (response.ok) {
        fetchBoards()
        setBoardMenuOpen(null)
        if (currentBoardId === boardId) {
          router.push("/dashboard/jobs")
        }
      }
    } catch (error) {
      console.error("Error deleting board:", error)
    }
  }

  return (
    <>
      <div
        className={`
          fixed left-0 top-0 h-full bg-white border-r border-gray-100 z-40
          flex flex-col
          transition-all duration-200 ease-in-out
          ${expanded ? "w-64" : "w-20"}
          ${className}
        `}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => {
          setExpanded(false)
          setBoardMenuOpen(null)
        }}
      >
        {/* Logo */}
        <div className={`
          h-20 flex items-center
          ${expanded ? "px-5" : "justify-center"}
        `}>
          <Link href="/dashboard/jobs" className="flex items-center">
            {expanded ? (
              <img 
                src="/logo.svg" 
                alt="Vergo" 
                className="h-8 w-auto"
              />
            ) : (
              <img 
                src="/icon.png" 
                alt="Vergo" 
                width={32} 
                height={32}
                className="flex-shrink-0"
              />
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 pt-4 overflow-y-auto">
          <ul className="space-y-1">
            {/* Tasks Section - Expandable with Boards */}
            <li>
              {/* Tasks Header */}
              <button
                onClick={() => {
                  if (expanded) {
                    setTasksExpanded(!tasksExpanded)
                  } else {
                    router.push("/dashboard/jobs")
                  }
                }}
                className={`
                  w-full flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                  transition-all duration-150
                  ${isOnTasksPage && !currentBoardId
                    ? "bg-gray-100 text-gray-900" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }
                  ${expanded ? "" : "justify-center"}
                `}
                style={{ width: expanded ? "calc(100% - 24px)" : "calc(100% - 24px)" }}
                title={!expanded ? UI_LABELS.jobsNavLabel : undefined}
              >
                <TasksIcon className="w-6 h-6 flex-shrink-0" />
                {expanded && (
                  <>
                    <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                      {UI_LABELS.jobsNavLabel}
                    </span>
                    {tasksExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </>
                )}
              </button>

              {/* Boards Sub-items (when expanded) */}
              {expanded && tasksExpanded && (
                <ul className="mt-1 ml-6 space-y-0.5">
                  {/* All Tasks */}
                  <li>
                    <Link
                      href="/dashboard/jobs"
                      className={`
                        flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                        transition-all duration-150
                        ${isOnTasksPage && !currentBoardId
                          ? "bg-blue-50 text-blue-700 font-medium" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                        }
                      `}
                    >
                      <TasksIcon className="w-4 h-4 flex-shrink-0" />
                      <span>All Tasks</span>
                    </Link>
                  </li>

                  {/* Divider if there are boards */}
                  {boards.length > 0 && (
                    <li className="mx-6 my-2">
                      <div className="border-t border-gray-200" />
                    </li>
                  )}

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
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white border rounded-lg shadow-lg z-50">
                            <button
                              onClick={() => handleArchiveBoard(board.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Archive className="w-4 h-4" />
                              Archive
                            </button>
                            <button
                              onClick={() => handleDeleteBoard(board.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
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
                        transition-all duration-150 w-full
                      "
                      style={{ width: "calc(100% - 24px)" }}
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      <span>New Board</span>
                    </button>
                  </li>
                </ul>
              )}
            </li>

            {/* Other Nav Items */}
            {otherNavItems.map((item) => {
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
                      ${expanded ? "" : "justify-center"}
                    `}
                    title={!expanded ? item.label : undefined}
                  >
                    <Icon className="w-6 h-6 flex-shrink-0" />
                    {expanded && (
                      <span className="text-base font-normal whitespace-nowrap">
                        {item.label}
                      </span>
                    )}
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
    </>
  )
}
