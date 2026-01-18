"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { 
  Plus, 
  Settings, 
  Eye, 
  EyeOff, 
  Trash2, 
  GripVertical,
  ChevronDown,
  Type,
  Calendar,
  User,
  FileText,
  Paperclip,
  CheckSquare
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColumnDefinition, AVAILABLE_COLUMN_TYPES, ColumnType } from "./types"

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
}

export function ColumnHeader({ columns, onColumnsChange }: ColumnHeaderProps) {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [newColumnLabel, setNewColumnLabel] = useState("")
  const [newColumnType, setNewColumnType] = useState<ColumnType>("text")
  const [addMenuPosition, setAddMenuPosition] = useState({ top: 0, left: 0 })
  const [settingsPosition, setSettingsPosition] = useState({ top: 0, left: 0 })
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Calculate position when opening
  useEffect(() => {
    if (isAddMenuOpen && addButtonRef.current) {
      const rect = addButtonRef.current.getBoundingClientRect()
      setAddMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 288) // 288 = w-72 = 18rem
      })
    }
  }, [isAddMenuOpen])

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
        addButtonRef.current && !addButtonRef.current.contains(e.target as Node) &&
        addMenuRef.current && !addMenuRef.current.contains(e.target as Node)
      ) {
        setIsAddMenuOpen(false)
      }
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

  const handleAddColumn = () => {
    if (!newColumnLabel.trim()) return

    const newColumn: ColumnDefinition = {
      id: `custom_${Date.now()}`,
      type: newColumnType,
      label: newColumnLabel.trim(),
      visible: true,
      order: columns.length,
      isSystem: false,
    }

    onColumnsChange([...columns, newColumn])
    setNewColumnLabel("")
    setNewColumnType("text")
    setIsAddMenuOpen(false)
  }

  const handleToggleVisibility = (columnId: string) => {
    onColumnsChange(
      columns.map(col => 
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    )
  }

  const handleDeleteColumn = (columnId: string) => {
    onColumnsChange(columns.filter(col => col.id !== columnId))
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

  const visibleColumns = columns.filter(col => col.visible)
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

  return (
    <div className="flex items-center gap-1">
      {/* Add Column Button */}
      <Button
        ref={addButtonRef}
        variant="ghost"
        size="sm"
        onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
      >
        <Plus className="w-4 h-4" />
      </Button>

      {/* Column Settings Button */}
      <Button
        ref={settingsButtonRef}
        variant="ghost"
        size="sm"
        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
      >
        <Settings className="w-4 h-4" />
      </Button>

      {/* Add Column Dropdown - Portal */}
      {isAddMenuOpen && typeof document !== "undefined" && createPortal(
        <div 
          ref={addMenuRef}
          className="fixed w-72 bg-white border border-gray-200 rounded-lg shadow-xl"
          style={{ 
            top: addMenuPosition.top, 
            left: addMenuPosition.left,
            zIndex: 9999 
          }}
        >
          <div className="p-3 border-b border-gray-100">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Add Column</h4>
            <input
              type="text"
              placeholder="Column name..."
              value={newColumnLabel}
              onChange={(e) => setNewColumnLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColumn()
              }}
            />
            <div className="grid grid-cols-3 gap-1">
              {AVAILABLE_COLUMN_TYPES.map(({ type, label }) => {
                const Icon = COLUMN_TYPE_ICONS[type]
                return (
                  <button
                    key={type}
                    onClick={() => setNewColumnType(type)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md text-xs transition-colors ${
                      newColumnType === type 
                        ? "bg-blue-50 text-blue-700 border border-blue-200" 
                        : "hover:bg-gray-50 text-gray-600"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="p-2">
            <Button
              size="sm"
              onClick={handleAddColumn}
              disabled={!newColumnLabel.trim()}
              className="w-full"
            >
              Add Column
            </Button>
          </div>
        </div>,
        document.body
      )}

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
                    <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{column.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Move buttons */}
                    <button
                      onClick={() => handleMoveColumn(column.id, "up")}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ChevronDown className="w-3 h-3 rotate-180 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleMoveColumn(column.id, "down")}
                      disabled={index === sortedColumns.length - 1}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                    {/* Visibility toggle */}
                    <button
                      onClick={() => handleToggleVisibility(column.id)}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      {column.visible ? (
                        <Eye className="w-4 h-4 text-gray-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-300" />
                      )}
                    </button>
                    {/* Delete button (only for non-system columns) */}
                    {!column.isSystem && (
                      <button
                        onClick={() => handleDeleteColumn(column.id)}
                        className="p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
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
