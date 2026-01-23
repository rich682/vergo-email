"use client"

/**
 * Formula Editor Modal
 *
 * Monday.com-style formula builder:
 * - Left sidebar with searchable column list
 * - Freeform expression area
 * - Live preview of calculated result
 * - Result type selector
 *
 * Supports both column formulas (applied per-row) and row formulas (aggregation per-column).
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Search, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Hash, Type, Calendar, DollarSign, FunctionSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseFormula, evaluateExpression, buildFormulaContext, SUPPORTED_FUNCTIONS } from "@/lib/formula"
import type { FormulaResultType, SheetData } from "@/lib/formula"

// ============================================
// Types
// ============================================

export interface ColumnResource {
  key: string
  label: string
  dataType: string
}

export interface SheetResource {
  id: string
  label: string
  columns: ColumnResource[]
}

export interface FormulaEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mode: "column" for column formulas (per-row), "row" for row formulas (aggregation) */
  mode: "column" | "row"
  /** Columns available in the current sheet */
  columns: ColumnResource[]
  /** Other sheets available for cross-sheet references */
  otherSheets?: SheetResource[]
  /** Sample row data for preview (first row of current sheet) */
  sampleRow?: Record<string, unknown>
  /** All rows for aggregate preview (row formulas) */
  allRows?: Record<string, unknown>[]
  /** Callback when formula is saved */
  onSave: (formula: { expression: string; resultType: FormulaResultType; label: string }) => void
  /** Initial values for editing existing formula */
  initialExpression?: string
  initialResultType?: FormulaResultType
  initialLabel?: string
}

// ============================================
// Icon Mapping
// ============================================

function getDataTypeIcon(dataType: string) {
  switch (dataType) {
    case "number":
      return <Hash className="w-3.5 h-3.5" />
    case "currency":
      return <DollarSign className="w-3.5 h-3.5" />
    case "date":
      return <Calendar className="w-3.5 h-3.5" />
    case "formula":
      return <FunctionSquare className="w-3.5 h-3.5" />
    default:
      return <Type className="w-3.5 h-3.5" />
  }
}

// ============================================
// Component
// ============================================

export function FormulaEditorModal({
  open,
  onOpenChange,
  mode,
  columns,
  otherSheets = [],
  sampleRow,
  allRows = [],
  onSave,
  initialExpression = "",
  initialResultType = "number",
  initialLabel = "",
}: FormulaEditorModalProps) {
  // State
  const [expression, setExpression] = useState(initialExpression)
  const [resultType, setResultType] = useState<FormulaResultType>(initialResultType)
  const [label, setLabel] = useState(initialLabel)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set(["current"]))
  const [saving, setSaving] = useState(false)
  
  // Expression input ref for cursor position
  const expressionRef = useRef<HTMLTextAreaElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setExpression(initialExpression)
      setResultType(initialResultType)
      setLabel(initialLabel)
      setSearchQuery("")
    }
  }, [open, initialExpression, initialResultType, initialLabel])

  // Parse validation
  const parseResult = useMemo(() => {
    if (!expression.trim()) return null
    return parseFormula(expression)
  }, [expression])

  const isValid = parseResult?.ok === true

  // Preview calculation
  const previewResult = useMemo(() => {
    if (!isValid || !parseResult?.ok) return null

    try {
      // Build context for evaluation
      const sheetData: SheetData[] = [{
        id: "current",
        label: "Current",
        rows: allRows.length > 0 ? allRows : sampleRow ? [sampleRow] : [],
      }]

      const context = buildFormulaContext(
        "current",
        sheetData,
        columns.map(c => ({ key: c.key, label: c.label, dataType: c.dataType }))
      )

      if (mode === "column" && sampleRow) {
        // Column formula: evaluate for first row
        const rowContext = {
          rowIndex: 0,
          row: sampleRow,
          identity: String(Object.values(sampleRow)[0] || "row-0"),
        }
        return evaluateExpression(expression, context, rowContext)
      }

      // For row formulas, we'd need different evaluation
      // For now, just validate syntax
      return { ok: true, value: 0 } as const
    } catch {
      return null
    }
  }, [isValid, parseResult, expression, sampleRow, allRows, columns, mode])

  // Filter columns by search
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns
    const q = searchQuery.toLowerCase()
    return columns.filter(c => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
  }, [columns, searchQuery])

  // Filter other sheets by search
  const filteredOtherSheets = useMemo(() => {
    if (!searchQuery.trim()) return otherSheets
    const q = searchQuery.toLowerCase()
    return otherSheets.map(sheet => ({
      ...sheet,
      columns: sheet.columns.filter(c => 
        c.label.toLowerCase().includes(q) || 
        c.key.toLowerCase().includes(q) ||
        sheet.label.toLowerCase().includes(q)
      ),
    })).filter(sheet => sheet.columns.length > 0 || sheet.label.toLowerCase().includes(q))
  }, [otherSheets, searchQuery])

  // Toggle sheet expansion
  const toggleSheet = useCallback((sheetId: string) => {
    setExpandedSheets(prev => {
      const next = new Set(prev)
      if (next.has(sheetId)) {
        next.delete(sheetId)
      } else {
        next.add(sheetId)
      }
      return next
    })
  }, [])

  // Insert column reference at cursor
  const insertColumnRef = useCallback((columnLabel: string, sheetLabel?: string) => {
    const ref = sheetLabel ? `{${sheetLabel}.${columnLabel}}` : `{${columnLabel}}`
    
    if (expressionRef.current) {
      const start = expressionRef.current.selectionStart
      const end = expressionRef.current.selectionEnd
      const before = expression.slice(0, start)
      const after = expression.slice(end)
      const newExpression = before + ref + after
      setExpression(newExpression)
      
      // Move cursor after inserted ref
      setTimeout(() => {
        if (expressionRef.current) {
          const newPos = start + ref.length
          expressionRef.current.focus()
          expressionRef.current.setSelectionRange(newPos, newPos)
        }
      }, 0)
    } else {
      setExpression(prev => prev + ref)
    }
  }, [expression])

  // Insert function
  const insertFunction = useCallback((funcName: string) => {
    const funcText = mode === "row" ? `${funcName}({column})` : `${funcName}()`
    
    if (expressionRef.current) {
      const start = expressionRef.current.selectionStart
      const before = expression.slice(0, start)
      const after = expression.slice(start)
      const newExpression = before + funcText + after
      setExpression(newExpression)
      
      // Move cursor inside parentheses
      setTimeout(() => {
        if (expressionRef.current) {
          const newPos = start + funcName.length + 1
          expressionRef.current.focus()
          expressionRef.current.setSelectionRange(newPos, newPos)
        }
      }, 0)
    } else {
      setExpression(prev => prev + funcText)
    }
  }, [expression, mode])

  // Handle save
  const handleSave = useCallback(async () => {
    if (!isValid || !label.trim()) return
    
    setSaving(true)
    try {
      await onSave({
        expression,
        resultType,
        label: label.trim(),
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }, [isValid, label, expression, resultType, onSave, onOpenChange])

  // Format preview value
  const formatPreviewValue = (value: number) => {
    if (resultType === "currency") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value)
    }
    return value.toLocaleString()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FunctionSquare className="w-5 h-5" />
            Formula builder
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Left Sidebar: Resources */}
          <div className="w-64 border-r bg-gray-50 flex flex-col">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search columns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {/* Functions Section */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-100 rounded">
                  <ChevronDown className="w-3.5 h-3.5" />
                  Functions
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1">
                  {SUPPORTED_FUNCTIONS.map((func) => (
                    <button
                      key={func}
                      onClick={() => insertFunction(func)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                    >
                      <FunctionSquare className="w-3.5 h-3.5 text-purple-500" />
                      {func}
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Current Sheet Columns */}
              <Collapsible open={expandedSheets.has("current")} onOpenChange={() => toggleSheet("current")}>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-100 rounded mt-3">
                  {expandedSheets.has("current") ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  Current Sheet
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1">
                  {filteredColumns.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">No columns found</p>
                  ) : (
                    filteredColumns.map((col) => (
                      <button
                        key={col.key}
                        onClick={() => insertColumnRef(col.label)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                      >
                        {getDataTypeIcon(col.dataType)}
                        <span className="truncate">{col.label}</span>
                      </button>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Other Sheets */}
              {filteredOtherSheets.map((sheet) => (
                <Collapsible
                  key={sheet.id}
                  open={expandedSheets.has(sheet.id)}
                  onOpenChange={() => toggleSheet(sheet.id)}
                >
                  <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-100 rounded mt-3">
                    {expandedSheets.has(sheet.id) ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    {sheet.label}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    {sheet.columns.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No columns found</p>
                    ) : (
                      sheet.columns.map((col) => (
                        <button
                          key={`${sheet.id}-${col.key}`}
                          onClick={() => insertColumnRef(col.label, sheet.label)}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                        >
                          {getDataTypeIcon(col.dataType)}
                          <span className="truncate">{col.label}</span>
                        </button>
                      ))
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>

          {/* Right Side: Expression Editor */}
          <div className="flex-1 flex flex-col p-4">
            {/* Label Input */}
            <div className="mb-4">
              <Label htmlFor="formula-label" className="text-sm font-medium">
                Column Name
              </Label>
              <Input
                id="formula-label"
                type="text"
                placeholder="e.g., Profit, Total Revenue"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Expression Input */}
            <div className="flex-1 flex flex-col min-h-0">
              <Label htmlFor="formula-expression" className="text-sm font-medium mb-1">
                Formula
              </Label>
              <textarea
                ref={expressionRef}
                id="formula-expression"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder={mode === "column" 
                  ? "{Contract Value} - {Contract Cost}" 
                  : "SUM({column})"
                }
                className={cn(
                  "flex-1 p-3 text-sm font-mono border rounded-md resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                  parseResult && !parseResult.ok && "border-red-300 focus:ring-red-500"
                )}
              />
              
              {/* Validation Message */}
              {parseResult && !parseResult.ok && (
                <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  {parseResult.error}
                </div>
              )}
              {parseResult?.ok && (
                <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Valid formula
                </div>
              )}
            </div>

            {/* Result Type */}
            <div className="mt-4">
              <Label htmlFor="result-type" className="text-sm font-medium">
                Result Type
              </Label>
              <Select value={resultType} onValueChange={(v) => setResultType(v as FormulaResultType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preview */}
            {previewResult && mode === "column" && sampleRow && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
                <p className="text-xs font-medium text-gray-500 mb-1">Preview (first row)</p>
                {previewResult.ok ? (
                  <p className="text-lg font-semibold text-gray-900">
                    {formatPreviewValue(previewResult.value)}
                  </p>
                ) : (
                  <p className="text-sm text-red-600">{previewResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || !label.trim() || saving}
          >
            {saving ? "Saving..." : "Set formula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
