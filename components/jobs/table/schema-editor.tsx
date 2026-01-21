"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  GripVertical,
  Key,
  Lock,
  Edit3,
  AlertCircle,
  Save,
  X,
  BarChart3,
  Users,
  Shield,
  CheckSquare
} from "lucide-react"
import { ColumnTypeSelector, ColumnType, getColumnTypeIcon } from "./column-type-selector"
import { IdentityKeySelector } from "./identity-key-selector"

export type ColumnEditPolicy = "READ_ONLY_IMPORTED" | "EDITABLE_COLLAB" | "COMPUTED_ROW" | "SYSTEM_VARIANCE"
export type ColumnSource = "imported" | "manual" | "computed" | "system"

export interface TableColumn {
  id: string
  label: string
  type: ColumnType
  source: ColumnSource
  editPolicy: ColumnEditPolicy
  isIdentity?: boolean
  isComparable?: boolean
  width?: number
}

export type RowAccessMode = "ALL" | "OWNER_ONLY" | "OWNER_AND_ADMINS"
export type CompletionRule = "DATASET_SIGNOFF" | "ALL_ROWS_VERIFIED" | "NO_REQUIREMENT"

export interface TableSchema {
  columns: TableColumn[]
  identityKey: string
  // Row-level access control
  rowOwnerColumn?: string
  rowAccessMode?: RowAccessMode
  // Completion semantics
  completionRule?: CompletionRule
}

interface TableSchemaEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lineageId: string
  lineageName: string
  initialSchema?: TableSchema
  onSave: (schema: TableSchema) => Promise<void>
}

const DEFAULT_COLUMN: Omit<TableColumn, "id" | "label"> = {
  type: "text",
  source: "imported",
  editPolicy: "READ_ONLY_IMPORTED",
  isComparable: false,
}

export function TableSchemaEditor({
  open,
  onOpenChange,
  lineageId,
  lineageName,
  initialSchema,
  onSave,
}: TableSchemaEditorProps) {
  const [columns, setColumns] = useState<TableColumn[]>(initialSchema?.columns || [])
  const [identityKey, setIdentityKey] = useState<string>(initialSchema?.identityKey || "")
  const [rowOwnerColumn, setRowOwnerColumn] = useState<string>(initialSchema?.rowOwnerColumn || "")
  const [rowAccessMode, setRowAccessMode] = useState<RowAccessMode>(initialSchema?.rowAccessMode || "ALL")
  const [completionRule, setCompletionRule] = useState<CompletionRule>(initialSchema?.completionRule || "NO_REQUIREMENT")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens with new initial data
  useEffect(() => {
    if (open) {
      setColumns(initialSchema?.columns || [])
      setIdentityKey(initialSchema?.identityKey || "")
      setRowOwnerColumn(initialSchema?.rowOwnerColumn || "")
      setRowAccessMode(initialSchema?.rowAccessMode || "ALL")
      setCompletionRule(initialSchema?.completionRule || "NO_REQUIREMENT")
      setError(null)
    }
  }, [open, initialSchema])

  const addColumn = useCallback(() => {
    const newId = `col_${Date.now()}`
    const newColumn: TableColumn = {
      ...DEFAULT_COLUMN,
      id: newId,
      label: `Column ${columns.length + 1}`,
    }
    setColumns(prev => [...prev, newColumn])
  }, [columns.length])

  const updateColumn = useCallback((id: string, updates: Partial<TableColumn>) => {
    setColumns(prev => prev.map(col => 
      col.id === id ? { ...col, ...updates } : col
    ))
  }, [])

  const removeColumn = useCallback((id: string) => {
    setColumns(prev => prev.filter(col => col.id !== id))
    // Clear identity key if we're removing that column
    if (identityKey === id) {
      setIdentityKey("")
    }
  }, [identityKey])

  const handleSourceChange = useCallback((id: string, source: ColumnSource) => {
    // Auto-set edit policy based on source
    const editPolicy: ColumnEditPolicy = source === "imported" 
      ? "READ_ONLY_IMPORTED" 
      : source === "manual" 
        ? "EDITABLE_COLLAB"
        : source === "computed"
          ? "COMPUTED_ROW"
          : "SYSTEM_VARIANCE"

    updateColumn(id, { source, editPolicy })
  }, [updateColumn])

  const handleSave = async () => {
    setError(null)

    // Validation
    if (columns.length === 0) {
      setError("Add at least one column to the schema")
      return
    }

    if (!identityKey) {
      setError("Select an identity key column to uniquely identify rows")
      return
    }

    // Check for duplicate column IDs
    const ids = columns.map(c => c.id)
    const uniqueIds = new Set(ids)
    if (ids.length !== uniqueIds.size) {
      setError("Column IDs must be unique")
      return
    }

    // Check for empty labels
    if (columns.some(c => !c.label.trim())) {
      setError("All columns must have a label")
      return
    }

    const schema: TableSchema = {
      columns: columns.map(col => ({
        ...col,
        isIdentity: col.id === identityKey
      })),
      identityKey,
      // Row-level access control (only include if configured)
      ...(rowOwnerColumn ? { rowOwnerColumn } : {}),
      ...(rowAccessMode !== "ALL" ? { rowAccessMode } : {}),
      // Completion semantics (only include if not default)
      ...(completionRule !== "NO_REQUIREMENT" ? { completionRule } : {}),
    }

    setSaving(true)
    try {
      await onSave(schema)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to save schema")
    } finally {
      setSaving(false)
    }
  }

  const isNumericType = (type: ColumnType) => 
    ["number", "currency", "percent", "amount"].includes(type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configure Table Schema</DialogTitle>
          <DialogDescription>
            Define the columns for "{lineageName}". Imported columns are read-only; manual columns are editable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Identity Key Selection */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-amber-900">Identity Key Column</h4>
                <p className="text-sm text-amber-700 mb-3">
                  Select the column that uniquely identifies each row (e.g., Invoice #, Account Code).
                  This is required for tracking changes between periods.
                </p>
                <IdentityKeySelector
                  columns={columns.map(c => ({ id: c.id, label: c.label }))}
                  value={identityKey}
                  onChange={setIdentityKey}
                />
              </div>
            </div>
          </div>

          {/* Columns List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Columns</Label>
              <Button variant="outline" size="sm" onClick={addColumn}>
                <Plus className="w-4 h-4 mr-1" />
                Add Column
              </Button>
            </div>

            {columns.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-sm text-gray-500 mb-2">No columns defined yet</p>
                <Button variant="outline" size="sm" onClick={addColumn}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add First Column
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {columns.map((column, index) => (
                  <div
                    key={column.id}
                    className="flex items-center gap-2 p-3 bg-white border rounded-lg"
                  >
                    <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                    
                    {/* Column ID (editable) */}
                    <Input
                      value={column.id}
                      onChange={(e) => {
                        const newId = e.target.value.replace(/[^a-zA-Z0-9_]/g, "_")
                        updateColumn(column.id, { id: newId })
                        if (identityKey === column.id) {
                          setIdentityKey(newId)
                        }
                      }}
                      className="w-28 text-xs font-mono"
                      placeholder="column_id"
                    />

                    {/* Column Label */}
                    <Input
                      value={column.label}
                      onChange={(e) => updateColumn(column.id, { label: e.target.value })}
                      className="flex-1"
                      placeholder="Column Label"
                    />

                    {/* Column Type */}
                    <ColumnTypeSelector
                      value={column.type}
                      onChange={(type) => updateColumn(column.id, { type })}
                    />

                    {/* Source (Imported vs Manual) */}
                    <Select
                      value={column.source}
                      onValueChange={(v) => handleSourceChange(column.id, v as ColumnSource)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="imported">
                          <div className="flex items-center gap-2">
                            <Lock className="w-3 h-3" />
                            <span>Imported</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="manual">
                          <div className="flex items-center gap-2">
                            <Edit3 className="w-3 h-3" />
                            <span>Manual</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Comparable Toggle (only for numeric types) */}
                    {isNumericType(column.type) && (
                      <div className="flex items-center gap-1.5" title="Include in variance analysis">
                        <BarChart3 className={`w-4 h-4 ${column.isComparable ? "text-blue-500" : "text-gray-300"}`} />
                        <Switch
                          checked={column.isComparable || false}
                          onCheckedChange={(checked) => updateColumn(column.id, { isComparable: checked })}
                        />
                      </div>
                    )}

                    {/* Identity indicator */}
                    {column.id === identityKey && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 rounded text-amber-700">
                        <Key className="w-3 h-3" />
                        <span className="text-xs">ID</span>
                      </div>
                    )}

                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(column.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Row Access Control (Advanced) */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" />
              <Label className="text-sm font-medium">Row-Level Access Control (Optional)</Label>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Row Owner Column */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">PM / Owner Column</Label>
                <Select
                  value={rowOwnerColumn || "none"}
                  onValueChange={(v) => setRowOwnerColumn(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-gray-400">No row ownership</span>
                    </SelectItem>
                    {columns.filter(c => c.type === "text" || c.type === "person").map(col => (
                      <SelectItem key={col.id} value={col.id}>
                        <div className="flex items-center gap-2">
                          <Users className="w-3 h-3" />
                          {col.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Column containing PM email/name for row-level filtering
                </p>
              </div>

              {/* Access Mode */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Access Mode</Label>
                <Select
                  value={rowAccessMode}
                  onValueChange={(v) => setRowAccessMode(v as RowAccessMode)}
                  disabled={!rowOwnerColumn}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Everyone sees all rows</SelectItem>
                    <SelectItem value="OWNER_ONLY">PMs see only their rows</SelectItem>
                    <SelectItem value="OWNER_AND_ADMINS">PMs + Admins see all</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Controls who can view and edit each row
                </p>
              </div>
            </div>

            {/* Completion Rule */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Completion Requirement</Label>
              <Select
                value={completionRule}
                onValueChange={(v) => setCompletionRule(v as CompletionRule)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NO_REQUIREMENT">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-3 h-3 text-gray-400" />
                      No verification required
                    </div>
                  </SelectItem>
                  <SelectItem value="DATASET_SIGNOFF">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-3 h-3 text-blue-500" />
                      Dataset sign-off required
                    </div>
                  </SelectItem>
                  <SelectItem value="ALL_ROWS_VERIFIED">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-3 h-3 text-green-500" />
                      All rows must be verified
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400 mt-1">
                Determines what's required before marking the task as complete
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                <span>Imported = read-only (from CSV/Excel)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Edit3 className="w-3 h-3" />
                <span>Manual = editable (notes, status, etc.)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3 text-blue-500" />
                <span>Comparable = included in variance analysis</span>
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Saving..." : "Save Schema"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
