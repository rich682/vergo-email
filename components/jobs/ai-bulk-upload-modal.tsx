"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Upload, FileSpreadsheet, X, Check, AlertCircle, Loader2 } from "lucide-react"

interface ParsedItem {
  name: string
  dueDate?: string
  originalRow: string[]
}

interface AIBulkUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

type UploadState = "idle" | "parsing" | "interpreting" | "preview" | "importing" | "complete" | "error"

export function AIBulkUploadModal({ open, onOpenChange, onImportComplete }: AIBulkUploadModalProps) {
  const [state, setState] = useState<UploadState>("idle")
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState(0)

  const resetState = () => {
    setState("idle")
    setFileName(null)
    setRawRows([])
    setParsedItems([])
    setSelectedItems(new Set())
    setError(null)
    setImportProgress(0)
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setFileName(file.name)
    setState("parsing")
    setError(null)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      
      // Filter out empty rows
      const nonEmptyRows = rows.filter(row => row.some(cell => cell && String(cell).trim()))
      
      if (nonEmptyRows.length === 0) {
        setError("The spreadsheet appears to be empty")
        setState("error")
        return
      }

      setRawRows(nonEmptyRows)
      setState("interpreting")

      // Send to AI for interpretation
      const response = await fetch("/api/jobs/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: nonEmptyRows })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to interpret spreadsheet")
      }

      const result = await response.json()
      const items: ParsedItem[] = result.items || []
      
      setParsedItems(items)
      // Select all items by default
      setSelectedItems(new Set(items.map((_, i) => i)))
      setState("preview")

    } catch (err: any) {
      console.error("Error processing file:", err)
      setError(err.message || "Failed to process file")
      setState("error")
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"]
    },
    maxFiles: 1,
    disabled: state !== "idle" && state !== "error"
  })

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
        await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: item.name,
            dueDate: item.dueDate || undefined
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

  const handleClose = () => {
    onOpenChange(false)
    resetState()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Bulk Import</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Upload Area */}
          {(state === "idle" || state === "error") && (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${isDragActive 
                  ? "border-purple-500 bg-purple-50" 
                  : "border-gray-300 hover:border-gray-400"
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                {isDragActive 
                  ? "Drop your spreadsheet here..." 
                  : "Drag & drop your checklist spreadsheet"
                }
              </p>
              <p className="text-xs text-gray-400">
                Supports .xlsx, .xls, and .csv files
              </p>
            </div>
          )}

          {/* Error State */}
          {state === "error" && error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Parsing/Interpreting State */}
          {(state === "parsing" || state === "interpreting") && (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {state === "parsing" ? "Reading spreadsheet..." : "AI is interpreting your data..."}
              </p>
              {fileName && (
                <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                  <FileSpreadsheet className="w-3 h-3" />
                  {fileName}
                </p>
              )}
            </div>
          )}

          {/* Preview State */}
          {state === "preview" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Found <span className="font-medium">{parsedItems.length}</span> items to import
                </p>
                <button
                  onClick={toggleAll}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedItems.size === parsedItems.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {parsedItems.map((item, index) => (
                  <label
                    key={index}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.has(index)}
                      onChange={() => toggleItem(index)}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.name}
                      </p>
                      {item.dueDate && (
                        <p className="text-xs text-gray-500">
                          Due: {item.dueDate}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedItems.size === 0}
                  className="bg-purple-600 text-white hover:bg-purple-700"
                >
                  Import {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}

          {/* Importing State */}
          {state === "importing" && (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-2">
                Importing items...
              </p>
              <div className="w-48 h-2 bg-gray-200 rounded-full mx-auto overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{importProgress}%</p>
            </div>
          )}

          {/* Complete State */}
          {state === "complete" && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">
                Import complete!
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} added to your checklist
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
