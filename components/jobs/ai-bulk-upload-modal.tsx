"use client"

import { useState, useCallback } from "react"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { 
  FileSpreadsheet, Check, AlertCircle, Loader2, 
  Sparkles, Download, ArrowRight, Calendar, User, ClipboardPaste, X
} from "lucide-react"

interface ParsedItem {
  name: string
  dueDate?: string
  description?: string
  priority?: "high" | "medium" | "low"
  ownerId?: string
  ownerName?: string
}

interface AIBulkUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
  boardId?: string | null
}

type Tab = "generate" | "paste"
type UploadState = "idle" | "parsing" | "interpreting" | "generating" | "preview" | "importing" | "complete" | "error"

const EXAMPLE_PROMPTS = [
  "Create a month-end close checklist for accounting",
  "Create a year-end financial checklist",
  "Create an employee onboarding checklist",
  "Create a quarterly compliance review checklist",
  "Create a project launch checklist",
]

export function AIBulkUploadModal({ open, onOpenChange, onImportComplete, boardId }: AIBulkUploadModalProps) {
  const [tab, setTab] = useState<Tab>("generate")
  const [state, setState] = useState<UploadState>("idle")
  const [prompt, setPrompt] = useState("")
  const [pastedData, setPastedData] = useState("")
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [hasParsedData, setHasParsedData] = useState(false)
  const [rowCount, setRowCount] = useState(0)
  const [colCount, setColCount] = useState(0)

  const resetState = () => {
    setState("idle")
    setPrompt("")
    setPastedData("")
    setParsedItems([])
    setSelectedItems(new Set())
    setError(null)
    setImportProgress(0)
    setHasParsedData(false)
    setRowCount(0)
    setColCount(0)
  }

  // Handle AI prompt generation
  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setState("generating")
    setError(null)

    try {
      const response = await fetch("/api/jobs/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate checklist")
      }

      const result = await response.json()
      const items: ParsedItem[] = result.items || []
      
      setParsedItems(items)
      setSelectedItems(new Set(items.map((_, i) => i)))
      setState("preview")

    } catch (err: any) {
      console.error("Error generating checklist:", err)
      setError(err.message || "Failed to generate checklist")
      setState("error")
    }
  }

  // Parse pasted data from Excel
  const parsePastedData = useCallback((text: string) => {
    if (!text.trim()) {
      setHasParsedData(false)
      setError(null)
      return
    }

    try {
      // Split into lines
      const lines = text.trim().split(/\r?\n/)
      
      if (lines.length < 2) {
        setError("Need at least a header row and one data row")
        setHasParsedData(false)
        return
      }

      // Detect delimiter (tab or comma)
      const firstLine = lines[0]
      const tabCount = (firstLine.match(/\t/g) || []).length
      const commaCount = (firstLine.match(/,/g) || []).length
      const delimiter = tabCount >= commaCount ? "\t" : ","

      // Parse rows
      const rows: string[][] = lines.map(line => {
        // Handle quoted values for comma-separated
        if (delimiter === ",") {
          const result: string[] = []
          let current = ""
          let inQuotes = false
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === "," && !inQuotes) {
              result.push(current.trim())
              current = ""
            } else {
              current += char
            }
          }
          result.push(current.trim())
          return result
        }
        return line.split(delimiter).map(cell => cell.trim())
      })

      // Filter out empty rows
      const nonEmptyRows = rows.filter(row => row.some(cell => cell && cell.trim()))

      if (nonEmptyRows.length < 2) {
        setError("Need at least a header row and one data row")
        setHasParsedData(false)
        return
      }

      setRowCount(nonEmptyRows.length - 1)
      setColCount(nonEmptyRows[0].length)
      setHasParsedData(true)
      setError(null)

    } catch (err: any) {
      setError(err.message || "Failed to parse pasted data")
      setHasParsedData(false)
    }
  }, [])

  // Handle paste data interpretation
  const handleInterpretPastedData = async () => {
    if (!pastedData.trim()) return

    setState("interpreting")
    setError(null)

    try {
      // Split into lines
      const lines = pastedData.trim().split(/\r?\n/)
      
      // Detect delimiter
      const firstLine = lines[0]
      const tabCount = (firstLine.match(/\t/g) || []).length
      const commaCount = (firstLine.match(/,/g) || []).length
      const delimiter = tabCount >= commaCount ? "\t" : ","

      // Parse rows
      const rows: string[][] = lines.map(line => {
        if (delimiter === ",") {
          const result: string[] = []
          let current = ""
          let inQuotes = false
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === "," && !inQuotes) {
              result.push(current.trim())
              current = ""
            } else {
              current += char
            }
          }
          result.push(current.trim())
          return result
        }
        return line.split(delimiter).map(cell => cell.trim())
      })

      // Filter out empty rows
      const nonEmptyRows = rows.filter(row => row.some(cell => cell && cell.trim()))

      // Send to AI for interpretation
      const response = await fetch("/api/jobs/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: nonEmptyRows })
      })

      if (!response.ok) {
        let errorMessage = "Failed to interpret data"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch {
          const text = await response.text()
          errorMessage = text || errorMessage
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const items: ParsedItem[] = result.items || []
      
      setParsedItems(items)
      setSelectedItems(new Set(items.map((_, i) => i)))
      setState("preview")

    } catch (err: any) {
      console.error("Error processing pasted data:", err)
      setError(err.message || "Failed to process data")
      setState("error")
    }
  }

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedItems(newSelected)
  }

  const toggleAll = () => {
    if (selectedItems.size === parsedItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(parsedItems.map((_, i) => i)))
    }
  }

  const handleImport = async () => {
    const itemsToImport = parsedItems.filter((_, i) => selectedItems.has(i))
    if (itemsToImport.length === 0) return

    setState("importing")
    setImportProgress(0)

    try {
      let imported = 0
      for (const item of itemsToImport) {
        await fetch("/api/task-instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: item.name,
            description: item.description || undefined,
            dueDate: item.dueDate || undefined,
            ownerId: item.ownerId || undefined,
            boardId: boardId || undefined,
            type: "GENERIC" // Default for AI bulk add
          })
        })
        imported++
        setImportProgress(Math.round((imported / itemsToImport.length) * 100))
      }

      setState("complete")
      setTimeout(() => {
        onImportComplete()
        onOpenChange(false)
        resetState()
      }, 1500)

    } catch (err: any) {
      console.error("Error importing items:", err)
      setError(err.message || "Failed to import items")
      setState("error")
    }
  }

  const handleDownloadTemplate = () => {
    window.open("/api/jobs/template", "_blank")
  }

  const handleClose = () => {
    onOpenChange(false)
    resetState()
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-700"
      case "medium": return "bg-amber-100 text-amber-700"
      case "low": return "bg-green-100 text-green-700"
      default: return "bg-gray-100 text-gray-600"
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-500" />
            AI Bulk Add
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2">
          {/* Tab Selection - Only show in idle state */}
          {(state === "idle" || state === "error") && (
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => { setTab("generate"); resetState(); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "generate" 
                    ? "bg-white text-gray-900 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                AI Generate
              </button>
              <button
                onClick={() => { setTab("paste"); resetState(); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "paste" 
                    ? "bg-white text-gray-900 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <ClipboardPaste className="w-4 h-4" />
                Paste from Excel
              </button>
            </div>
          )}

          {/* AI Generate Tab */}
          {tab === "generate" && (state === "idle" || state === "error") && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe the checklist you want to create
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., Create a month-end close checklist for accounting..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                />
              </div>

              {/* Example prompts */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Try one of these:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(example)}
                      className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                    >
                      {example.length > 40 ? example.slice(0, 40) + "..." : example}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Checklist
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Paste from Excel Tab */}
          {tab === "paste" && (state === "idle" || state === "error") && (
            <div className="space-y-4">
              {/* Paste Input or Parsed Data View */}
              {!hasParsedData ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <ClipboardPaste className="w-4 h-4" />
                    <span>Copy from Excel → Paste here</span>
                  </div>
                  <Textarea
                    placeholder="Paste your Excel data here (include headers)...

Example:
Task Name	Due Date	Owner	Description
Reconcile bank accounts	2026-01-31	John	Monthly bank rec
Review journal entries	2026-01-31	Sarah	Month-end review
Submit payroll	2026-01-25	Mike	Process payroll"
                    value={pastedData}
                    onChange={(e) => {
                      setPastedData(e.target.value)
                      parsePastedData(e.target.value)
                    }}
                    className="min-h-[180px] font-mono text-sm"
                  />
                </div>
              ) : (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Data ready</p>
                        <p className="text-sm text-gray-500">
                          {rowCount} rows, {colCount} columns
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={resetState}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Template Download */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-700">Need a template?</p>
                  <p className="text-xs text-gray-500">Download our CSV template with the correct column format</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="w-4 h-4 mr-1" />
                  Template
                </Button>
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-medium">Supported columns:</p>
                <ul className="list-disc list-inside space-y-0.5 text-gray-400">
                  <li><span className="text-gray-600">Task Name</span> (required)</li>
                  <li><span className="text-gray-600">Due Date</span> - Any date format</li>
                  <li><span className="text-gray-600">Owner</span> - Will match to your team members</li>
                  <li><span className="text-gray-600">Description</span> - Task details</li>
                  <li><span className="text-gray-600">Priority</span> - High, Medium, or Low</li>
                </ul>
              </div>

              <Button
                onClick={handleInterpretPastedData}
                disabled={!hasParsedData}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Process with AI
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Error State */}
          {state === "error" && error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Loading States */}
          {(state === "parsing" || state === "interpreting" || state === "generating") && (
            <div className="py-12 text-center">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {state === "parsing" && "Reading data..."}
                {state === "interpreting" && "AI is interpreting your data..."}
                {state === "generating" && "AI is generating your checklist..."}
              </p>
            </div>
          )}

          {/* Preview State */}
          {state === "preview" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{parsedItems.length}</span> tasks ready to import
                </p>
                <button
                  onClick={toggleAll}
                  className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                >
                  {selectedItems.size === parsedItems.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {parsedItems.map((item, index) => (
                  <label
                    key={index}
                    className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.has(index)}
                      onChange={() => toggleItem(index)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {item.dueDate && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {item.dueDate}
                          </span>
                        )}
                        {item.ownerName && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <User className="w-3 h-3" />
                            {item.ownerName}
                          </span>
                        )}
                        {item.priority && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPriorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button variant="ghost" onClick={() => { resetState(); }}>
                  ← Start over
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={selectedItems.size === 0}
                    className="bg-orange-600 text-white hover:bg-orange-700"
                  >
                    Import {selectedItems.size} task{selectedItems.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Importing State */}
          {state === "importing" && (
            <div className="py-12 text-center">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-3">
                Importing tasks...
              </p>
              <div className="w-48 h-2 bg-gray-200 rounded-full mx-auto overflow-hidden">
                <div 
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">{importProgress}%</p>
            </div>
          )}

          {/* Complete State */}
          {state === "complete" && (
            <div className="py-12 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <p className="text-lg font-medium text-gray-900">
                Import complete!
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {selectedItems.size} task{selectedItems.size !== 1 ? "s" : ""} added to your checklist
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
