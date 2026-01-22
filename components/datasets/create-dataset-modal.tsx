"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload, FileSpreadsheet, ArrowLeft, Trash2, AlertCircle } from "lucide-react"
import { parseFileForSchema, isSchemaParseError, DetectedColumn, ColumnType } from "@/lib/utils/schema-parser"

interface SchemaColumn {
  key: string
  label: string
  type: ColumnType
  required: boolean
}

interface CreateDatasetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  // Task-linked mode: when provided, updates schema via /api/data/tasks/[taskId]/schema
  taskId?: string
  taskName?: string
}

const COLUMN_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "currency", label: "Currency" },
]

type Step = "upload" | "review"

export function CreateDatasetModal({ 
  open, 
  onOpenChange, 
  onCreated,
  taskId,
  taskName,
}: CreateDatasetModalProps) {
  // Step management
  const [step, setStep] = useState<Step>("upload")
  
  // Upload step state
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  
  // Review step state
  const [columns, setColumns] = useState<SchemaColumn[]>([])
  const [identityKey, setIdentityKey] = useState("")
  const [stakeholderColumn, setStakeholderColumn] = useState<string | null>(null)
  const [rowCount, setRowCount] = useState(0)
  
  // Saving state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setStep("upload")
    setUploadError(null)
    setParsing(false)
    setFileName(null)
    setColumns([])
    setIdentityKey("")
    setStakeholderColumn(null)
    setRowCount(0)
    setError(null)
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      resetForm()
    }
    onOpenChange(open)
  }, [onOpenChange, resetForm])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setParsing(true)
    setUploadError(null)

    try {
      const result = await parseFileForSchema(file)
      
      if (isSchemaParseError(result)) {
        setUploadError(result.message)
        setParsing(false)
        return
      }

      // Convert detected columns to schema columns
      const schemaColumns: SchemaColumn[] = result.columns.map((col: DetectedColumn) => ({
        key: col.key,
        label: col.label,
        type: col.type,
        required: false,
      }))

      setColumns(schemaColumns)
      setFileName(file.name)
      setRowCount(result.rowCount)
      
      // Default identity key to first column
      if (schemaColumns.length > 0) {
        setIdentityKey(schemaColumns[0].key)
      }
      
      setStep("review")
    } catch (err) {
      setUploadError("Failed to parse file. Please try again.")
    } finally {
      setParsing(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: parsing,
  })

  const updateColumn = (index: number, updates: Partial<SchemaColumn>) => {
    const newColumns = [...columns]
    newColumns[index] = { ...newColumns[index], ...updates }
    setColumns(newColumns)
  }

  const removeColumn = (index: number) => {
    const removedKey = columns[index].key
    const newColumns = columns.filter((_, i) => i !== index)
    setColumns(newColumns)
    
    // If removing the identity key column, reset to first column
    if (removedKey === identityKey && newColumns.length > 0) {
      setIdentityKey(newColumns[0].key)
    }
    
    // If removing the stakeholder column, clear it
    if (removedKey === stakeholderColumn) {
      setStakeholderColumn(null)
    }
  }

  const handleSave = async () => {
    if (columns.length === 0) {
      setError("At least one column is required")
      return
    }
    if (!identityKey || !columns.some(c => c.key === identityKey)) {
      setError("Please select an identity key column")
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Use task-linked endpoint if taskId is provided
      const url = taskId 
        ? `/api/data/tasks/${taskId}/schema`
        : "/api/datasets"

      // Build stakeholder mapping if selected
      const stakeholderMapping = stakeholderColumn 
        ? { columnKey: stakeholderColumn, matchedField: "email" }
        : undefined

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schema: columns,
          identityKey,
          stakeholderMapping,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save data schema")
      }

      resetForm()
      onCreated()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save schema"
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {taskName ? `Configure Schema for "${taskName}"` : "Configure Data Schema"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="py-6">
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV or Excel file to automatically detect columns and data types.
            </p>

            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
                ${parsing ? "opacity-50 cursor-wait" : ""}
              `}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              {parsing ? (
                <p className="text-gray-600">Parsing file...</p>
              ) : isDragActive ? (
                <p className="text-blue-600">Drop file here</p>
              ) : (
                <>
                  <p className="text-gray-600 mb-1">
                    Drag and drop a file here, or click to browse
                  </p>
                  <p className="text-sm text-gray-400">
                    Supports CSV, XLSX, and XLS files
                  </p>
                </>
              )}
            </div>

            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{uploadError}</p>
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6 py-4">
            {/* File info */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-gray-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p className="text-xs text-gray-500">
                  {columns.length} columns detected, {rowCount.toLocaleString()} rows
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Change file
              </Button>
            </div>

            {/* Detected Columns */}
            <div>
              <Label className="mb-3 block">Detected Columns</Label>
              <div className="space-y-2 bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                {columns.map((column, index) => (
                  <div
                    key={column.key}
                    className="flex items-center gap-2 bg-white rounded-lg p-3 border border-gray-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {column.label}
                      </p>
                      <p className="text-xs text-gray-400">{column.key}</p>
                    </div>

                    <Select
                      value={column.type}
                      onValueChange={(value) => updateColumn(index, { type: value as ColumnType })}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMN_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(index)}
                      disabled={columns.length === 1}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Identity Key Selection */}
            <div>
              <Label htmlFor="identityKey">Identity Key (required)</Label>
              <p className="text-sm text-gray-500 mb-2">
                Select the column that uniquely identifies each row
              </p>
              <Select value={identityKey} onValueChange={setIdentityKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select identity key column" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.key} value={column.key}>
                      {column.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stakeholder Column Selection (Optional) */}
            <div>
              <Label htmlFor="stakeholderColumn">Stakeholder Column (optional)</Label>
              <p className="text-sm text-gray-500 mb-2">
                Select a column containing email addresses to link rows to contacts
              </p>
              <Select 
                value={stakeholderColumn || "_none"} 
                onValueChange={(v) => setStakeholderColumn(v === "_none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {columns.map((column) => (
                    <SelectItem key={column.key} value={column.key}>
                      {column.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Schema"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
