"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { 
  Settings, 
  Eye, 
  EyeOff, 
  GripVertical,
  ChevronDown,
  Type,
  Calendar,
  User,
  Clock,
  LayoutList,
  CheckSquare
} from "lucide-react"
import { Button } from "@/components/ui/button"

export interface BoardColumnDefinition {
  id: string
  label: string
  width?: number
  visible: boolean
  order: number
  isSystem: boolean
}

interface BoardColumnHeaderProps {
  columns: BoardColumnDefinition[]
  onColumnsChange: (columns: BoardColumnDefinition[]) => void
  canEditColumns?: boolean
}

const COLUMN_TYPE_ICONS: Record<string, typeof Type> = {
  // Board columns
  name: LayoutList,
  cadence: Clock,
  period: Calendar,
  status: CheckSquare,
  owner: User,
  updatedAt: Calendar,
  // Task columns
  type: LayoutList,
  dueDate: Calendar,
  responses: Type, // Message icon would be better but using Type as fallback
  notes: Type,
  files: Type,
}

export function BoardColumnHeader({ columns, onColumnsChange, canEditColumns = true }: BoardColumnHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsPosition, setSettingsPosition] = useState({ top: 0, left: 0 })
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSettingsOpen && settingsButtonRef.current) {
      const rect = settingsButtonRef.current.getBoundingClientRect()
      setSettingsPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 256) // 256 = w-64 = 16rem
      })
    }
  }, [isSettingsOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsButtonRef.current && !settingsButtonRef.current.contains(e.target as Node) &&
        settingsRef.current && !settingsRef.current.contains(e.target as Node)
      ) {
        setIsSettingsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleToggleVisibility = (columnId: string) => {
    // Don't allow hiding the name column
    if (columnId === "name") return
    
    onColumnsChange(
      columns.map(col => 
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    )
  }

  const handleMoveColumn = (columnId: string, direction: "up" | "down") => {
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order)
    const currentIndex = sortedColumns.findIndex(col => col.id === columnId)
    
    if (direction === "up" && currentIndex > 0) {
      const newIndex = currentIndex - 1
      const reordered = [...sortedColumns]
      const [moved] = reordered.splice(currentIndex, 1)
      reordered.splice(newIndex, 0, moved)
      onColumnsChange(reordered.map((col, i) => ({ ...col, order: i })))
    } else if (direction === "down" && currentIndex < sortedColumns.length - 1) {
      const newIndex = currentIndex + 1
      const reordered = [...sortedColumns]
      const [moved] = reordered.splice(currentIndex, 1)
      reordered.splice(newIndex, 0, moved)
      onColumnsChange(reordered.map((col, i) => ({ ...col, order: i })))
    }
  }

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

  if (!canEditColumns) {
    return null
  }

  return (
    <div className="flex items-center">
      {/* Column Settings Button */}
      <Button
        ref={settingsButtonRef}
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          setIsSettingsOpen(!isSettingsOpen)
        }}
        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
        title="Manage columns"
        aria-label="Manage columns"
      >
        <Settings className="w-4 h-4" />
      </Button>

      {/* Settings Dropdown - Portal */}
      {isSettingsOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={settingsRef}
          className="fixed w-64 bg-white border border-gray-200 rounded-lg shadow-xl"
          style={{
            top: settingsPosition.top,
            left: settingsPosition.left,
            zIndex: 9999
          }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
          aria-label="Column settings"
        >
          <div className="p-2 border-b border-gray-100">
            <h4 className="text-sm font-medium text-gray-900 px-2 py-1">Manage Columns</h4>
            <p className="text-xs text-gray-500 px-2">Show, hide, or reorder columns</p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {sortedColumns.map((column, index) => {
              const Icon = COLUMN_TYPE_ICONS[column.id] || Type
              const isNameColumn = column.id === "name"

              return (
                <div
                  key={column.id}
                  className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50"
                  role="menuitem"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-300" aria-hidden="true" />
                    <Icon className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    <span className="text-sm text-gray-700">{column.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Move buttons */}
                    <button
                      onClick={() => handleMoveColumn(column.id, "up")}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                      title="Move up"
                      aria-label={`Move ${column.label} up`}
                    >
                      <ChevronDown className="w-3 h-3 rotate-180 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleMoveColumn(column.id, "down")}
                      disabled={index === sortedColumns.length - 1}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                      title="Move down"
                      aria-label={`Move ${column.label} down`}
                    >
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                    {/* Visibility toggle */}
                    <button
                      onClick={() => handleToggleVisibility(column.id)}
                      disabled={isNameColumn}
                      className={`p-1 rounded hover:bg-gray-100 ${isNameColumn ? "opacity-30 cursor-not-allowed" : ""}`}
                      title={isNameColumn ? "Name column is always visible" : column.visible ? "Hide column" : "Show column"}
                      aria-label={isNameColumn ? "Name column is always visible" : column.visible ? `Hide ${column.label}` : `Show ${column.label}`}
                    >
                      {column.visible ? (
                        <Eye className="w-3 h-3 text-gray-400" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-gray-300" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
