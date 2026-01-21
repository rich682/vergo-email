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
  FileText,
  Paperclip,
  CheckSquare,
  MessageSquare,
  Layers
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColumnDefinition, ColumnType } from "./types"

interface ColumnHeaderProps {
  columns: ColumnDefinition[]
  onColumnsChange: (columns: ColumnDefinition[]) => void
}

const COLUMN_TYPE_ICONS: Record<ColumnType, typeof Type> = {
  text: Type,
  status: CheckSquare,
  person: User,
  date: Calendar,
  notes: FileText,
  files: Paperclip,
  responses: MessageSquare,
  taskType: Layers,
}

export function ColumnHeader({ columns, onColumnsChange }: ColumnHeaderProps) {
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

  return (
    <div className="flex items-center">
      {/* Column Settings Button */}
      <Button
        ref={settingsButtonRef}
        variant="ghost"
        size="sm"
        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
        title="Manage columns"
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
        >
          <div className="p-2 border-b border-gray-100">
            <h4 className="text-sm font-medium text-gray-900 px-2 py-1">Manage Columns</h4>
            <p className="text-xs text-gray-500 px-2">Show, hide, or reorder columns</p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {sortedColumns.map((column, index) => {
              const Icon = COLUMN_TYPE_ICONS[column.type]
              return (
                <div
                  key={column.id}
                  className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-300" />
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{column.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Move buttons */}
                    <button
                      onClick={() => handleMoveColumn(column.id, "up")}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronDown className="w-3 h-3 rotate-180 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleMoveColumn(column.id, "down")}
                      disabled={index === sortedColumns.length - 1}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                    {/* Visibility toggle */}
                    <button
                      onClick={() => handleToggleVisibility(column.id)}
                      className="p-1 rounded hover:bg-gray-100"
                      title={column.visible ? "Hide column" : "Show column"}
                    >
                      {column.visible ? (
                        <Eye className="w-4 h-4 text-gray-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-300" />
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
