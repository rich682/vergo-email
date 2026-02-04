"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import * as XLSX from "xlsx"
import {
  ArrowLeft,
  FileSpreadsheet,
  Plus,
  Trash2,
  GripVertical,
  Upload,
  FileUp,
  Table,
  Check,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ============================================
// Types
// ============================================

interface SchemaColumn {
  key: string
  label: string
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "dropdown"
  required: boolean
  order: number
  dropdownOptions?: string[]
}

type CreateMethod = "manual" | "upload"

// ============================================
// Constants
// ============================================

const DATA_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "currency", label: "Currency" },
  { value: "dropdown", label: "Dropdown" },
]

const MAX_SAMPLE_ROWS = 20
const MAX_PREVIEW_VALUE_LENGTH = 50

// ============================================
// Helpers
// ============================================

function generateKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    || "column"
}

function inferDataType(values: (string | number | boolean | null)[]): SchemaColumn["dataType"] {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== "")
  if (nonEmpty.length === 0) return "text"

  // Boolean check
  const boolPatterns = ["true", "false", "yes", "no", "1", "0", "y", "n"]
  if (nonEmpty.every(v => boolPatterns.includes(String(v).toLowerCase().trim()))) {
    return "boolean"
  }

  // Currency check
  const currencyPattern = /^[$£€¥]?\s*-?\d{1,3}(,\d{3})*(\.\d{2})?$|^-?\d+\.\d{2}$/
  const currencyCount = nonEmpty.filter(v => currencyPattern.test(String(v).trim())).length
  if (currencyCount >= nonEmpty.length * 0.7) return "currency"

  // Number check
  const numberCount = nonEmpty.filter(v => {
    const str = String(v).trim().replace(/,/g, "")
    return !isNaN(parseFloat(str)) && isFinite(Number(str))
  }).length
  if (numberCount >= nonEmpty.length * 0.7) return "number"

  // Date check
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  ]
  const dateCount = nonEmpty.filter(v => {
    const str = String(v).trim()
    return datePatterns.some(p => p.test(str))
  }).length
  if (dateCount >= nonEmpty.length * 0.7) return "date"

  return "text"
}

// ============================================
// Component
// ============================================

export default function NewDatabasePage() {
  const router = useRouter()
  
  // Basic info state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  
  // Method selection
  const [method, setMethod] = useState<CreateMethod | null>(null)
  
  // Manual schema state
  const [columns, setColumns] = useState<SchemaColumn[]>([
    { key: "id", label: "ID", dataType: "text", required: true, order: 0 },
  ])
  
  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([])
  const [inferredColumns, setInferredColumns] = useState<SchemaColumn[]>([])
  const [importSampleData, setImportSampleData] = useState(true)
  const [parseError, setParseError] = useState<string | null>(null)
  
  // Form state
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ----------------------------------------
  // Manual Schema Handlers
  // ----------------------------------------

  const addColumn = () => {
    const newOrder = columns.length
    const newKey = `column_${newOrder + 1}`
    setColumns([
      ...columns,
      { key: newKey, label: "", dataType: "text", required: false, order: newOrder },
    ])
  }

  const updateColumn = (index: number, updates: Partial<SchemaColumn>) => {
    setColumns(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...updates }
      
      if (updates.label !== undefined) {
        const newKey = generateKey(updates.label)
        let uniqueKey = newKey
        let counter = 1
        while (updated.some((c, i) => i !== index && c.key === uniqueKey)) {
          uniqueKey = `${newKey}_${counter}`
          counter++
        }
        updated[index].key = uniqueKey || `column_${index + 1}`
      }
      
      return updated
    })
  }

  const removeColumn = (index: number) => {
    if (columns.length <= 1) return
    
    setColumns(prev => {
      const updated = prev.filter((_, i) => i !== index)
      return updated.map((col, i) => ({ ...col, order: i }))
    })
  }

  // ----------------------------------------
  // Upload Handlers
  // ----------------------------------------

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadedFile(file)
    setParseError(null)
    
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "buffer", cellNF: true })
      
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) {
        throw new Error("Excel file has no sheets")
      }
      
      const worksheet = workbook.Sheets[firstSheet]
      const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      })
      
      if (rawData.length === 0) {
        throw new Error("Excel file is empty")
      }
      
      // Extract headers
      const headers = rawData[0].map((h: any) => String(h || "").trim()).filter(h => h)
      if (headers.length === 0) {
        throw new Error("No headers found in first row")
      }
      
      setParsedHeaders(headers)
      
      // Extract sample rows
      const dataRows = rawData.slice(1).filter((row: any[]) => 
        row.some(cell => cell !== null && cell !== undefined && cell !== "")
      )
      
      const samples = dataRows.slice(0, MAX_SAMPLE_ROWS).map((row: any[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((header, index) => {
          obj[header] = row[index] ?? null
        })
        return obj
      })
      
      setSampleRows(samples)
      
      // Infer columns
      const inferred: SchemaColumn[] = headers.map((header, index) => {
        const key = generateKey(header)
        const sampleValues = samples.map(row => row[header])
        const dataType = inferDataType(sampleValues)
        
        return {
          key: key || `column_${index}`,
          label: header,
          dataType,
          required: false,
          order: index,
        }
      })
      
      // Ensure unique keys
      const usedKeys = new Set<string>()
      inferred.forEach((col, index) => {
        let uniqueKey = col.key
        let counter = 1
        while (usedKeys.has(uniqueKey)) {
          uniqueKey = `${col.key}_${counter}`
          counter++
        }
        usedKeys.add(uniqueKey)
        inferred[index].key = uniqueKey
      })
      
      setInferredColumns(inferred)
      
    } catch (err: any) {
      setParseError(err.message || "Failed to parse Excel file")
      setParsedHeaders([])
      setSampleRows([])
      setInferredColumns([])
    }
  }, [])

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  const updateInferredColumn = (index: number, updates: Partial<SchemaColumn>) => {
    setInferredColumns(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...updates }
      return updated
    })
  }

  // ----------------------------------------
  // Create Handler
  // ----------------------------------------

  const handleCreate = async () => {
    const schemaColumns = method === "upload" ? inferredColumns : columns
    
    // Validation
    if (!name.trim()) {
      setError("Database name is required")
      return
    }
    
    if (schemaColumns.length === 0) {
      setError("At least one column is required")
      return
    }
    
    const emptyLabels = schemaColumns.filter(c => !c.label.trim())
    if (emptyLabels.length > 0) {
      setError("All columns must have labels")
      return
    }
    
    setCreating(true)
    setError(null)
    
    try {
      // Prepare initial rows if importing sample data
      let initialRows: any[] | undefined
      if (method === "upload" && importSampleData && sampleRows.length > 0) {
        // Convert sample rows to use column keys instead of labels
        initialRows = sampleRows.map(row => {
          const newRow: Record<string, any> = {}
          inferredColumns.forEach(col => {
            newRow[col.key] = row[col.label] ?? null
          })
          return newRow
        })
      }
      
      const response = await fetch("/api/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          schema: {
            columns: schemaColumns,
            version: 1,
          },
          initialRows,
        }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create database")
      }
      
      const data = await response.json()
      router.push(`/dashboard/databases/${data.database.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ----------------------------------------
  // Render
  // ----------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/databases">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Create Database</h1>
              <p className="mt-1 text-sm text-gray-500">
                Define your database schema manually or upload a spreadsheet
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Database Name <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Vendors, Employees, Products"
                className="mt-1.5"
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this database"
                className="mt-1.5"
                rows={2}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Method Selection */}
          {method === null ? (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">How do you want to define the schema?</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMethod("manual")}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-orange-300 hover:bg-orange-50 transition-all text-left group"
                >
                  <Table className="w-8 h-8 text-gray-400 group-hover:text-orange-500 mb-3" />
                  <h3 className="font-medium text-gray-900">Create manually</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Define columns, types, and requirements one by one
                  </p>
                </button>
                
                <button
                  onClick={() => setMethod("upload")}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-orange-300 hover:bg-orange-50 transition-all text-left group"
                >
                  <FileUp className="w-8 h-8 text-gray-400 group-hover:text-orange-500 mb-3" />
                  <h3 className="font-medium text-gray-900">Upload spreadsheet</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Import schema from Excel headers with optional sample data
                  </p>
                </button>
              </div>
            </div>
          ) : method === "manual" ? (
            /* Manual Schema Builder */
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">Schema</h2>
                  <p className="text-sm text-gray-500">Define the columns for your database</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMethod(null)}
                  >
                    Change method
                  </Button>
                  <Button variant="outline" size="sm" onClick={addColumn}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Column
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {/* Column headers */}
                <div className="grid grid-cols-[auto,1fr,140px,80px,40px] gap-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="w-6" />
                  <div>Label</div>
                  <div>Type</div>
                  <div>Required</div>
                  <div />
                </div>

                {/* Column rows */}
                {columns.map((column, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-[auto,1fr,140px,80px,40px] gap-3 items-center p-2">
                      <div className="w-6 flex justify-center">
                        <GripVertical className="w-4 h-4 text-gray-400" />
                      </div>
                      
                      <Input
                        value={column.label}
                        onChange={(e) => updateColumn(index, { label: e.target.value })}
                        placeholder="Column label"
                        className="h-9"
                      />
                      
                      <Select
                        value={column.dataType}
                        onValueChange={(value) => {
                          const updates: Partial<SchemaColumn> = { dataType: value as SchemaColumn["dataType"] }
                          // Initialize dropdownOptions when switching to dropdown type
                          if (value === "dropdown" && !column.dropdownOptions) {
                            updates.dropdownOptions = []
                          }
                          updateColumn(index, updates)
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={column.required}
                          onChange={(e) => updateColumn(index, { required: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                        />
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColumn(index)}
                        disabled={columns.length <= 1}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {/* Dropdown options editor */}
                    {column.dataType === "dropdown" && (
                      <div className="px-2 pb-2 ml-9">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Options (one per line)
                        </label>
                        <textarea
                          value={(column.dropdownOptions || []).join("\n")}
                          onChange={(e) => {
                            const options = e.target.value
                              .split("\n")
                              .map(o => o.trim())
                              .filter(o => o.length > 0)
                            updateColumn(index, { dropdownOptions: options })
                          }}
                          placeholder="Option 1&#10;Option 2&#10;Option 3"
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Uniqueness:</strong> Each row is uniquely identified by the combination of ALL column values. 
                  Duplicate rows (where every column matches) will be automatically skipped during import.
                </p>
              </div>
            </div>
          ) : (
            /* Upload-based Schema */
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">Upload Spreadsheet</h2>
                  <p className="text-sm text-gray-500">
                    Upload an Excel file to auto-detect schema from headers
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMethod(null)
                    setUploadedFile(null)
                    setParsedHeaders([])
                    setSampleRows([])
                    setInferredColumns([])
                    setParseError(null)
                  }}
                >
                  Change method
                </Button>
              </div>

              {!uploadedFile ? (
                /* Drop zone */
                <div
                  onDrop={handleFileDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-orange-400 hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">
                      Drag and drop an Excel file here, or{" "}
                      <span className="text-orange-600 font-medium">browse</span>
                    </p>
                    <p className="text-sm text-gray-400 mt-1">.xlsx or .xls files</p>
                  </label>
                </div>
              ) : parseError ? (
                /* Parse error */
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-700">Failed to parse file</p>
                      <p className="text-sm text-red-600 mt-1">{parseError}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setUploadedFile(null)
                          setParseError(null)
                        }}
                      >
                        Try another file
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Schema preview */
                <div className="space-y-6">
                  {/* File info */}
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <Check className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                      <p className="font-medium text-green-700">{uploadedFile.name}</p>
                      <p className="text-sm text-green-600">
                        {parsedHeaders.length} columns, {sampleRows.length} sample rows detected
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadedFile(null)
                        setParsedHeaders([])
                        setSampleRows([])
                        setInferredColumns([])
                      }}
                    >
                      Change file
                    </Button>
                  </div>

                  {/* Column configuration */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">Review & Configure Columns</h3>
                    <div className="space-y-3">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr,140px,80px] gap-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div>Label</div>
                        <div>Type</div>
                        <div>Required</div>
                      </div>

                      {/* Column rows */}
                      {inferredColumns.map((column, index) => (
                        <div key={index} className="bg-gray-50 rounded-lg">
                          <div className="grid grid-cols-[1fr,140px,80px] gap-3 items-center p-2">
                            <Input
                              value={column.label}
                              onChange={(e) => updateInferredColumn(index, { label: e.target.value })}
                              className="h-9"
                            />
                            
                            <Select
                              value={column.dataType}
                              onValueChange={(value) => {
                                const updates: Partial<SchemaColumn> = { dataType: value as SchemaColumn["dataType"] }
                                if (value === "dropdown" && !column.dropdownOptions) {
                                  updates.dropdownOptions = []
                                }
                                updateInferredColumn(index, updates)
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DATA_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            
                            <div className="flex justify-center">
                              <input
                                type="checkbox"
                                checked={column.required}
                                onChange={(e) => updateInferredColumn(index, { required: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                              />
                            </div>
                          </div>
                          
                          {/* Dropdown options editor */}
                          {column.dataType === "dropdown" && (
                            <div className="px-2 pb-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Options (one per line)
                              </label>
                              <textarea
                                value={(column.dropdownOptions || []).join("\n")}
                                onChange={(e) => {
                                  const options = e.target.value
                                    .split("\n")
                                    .map(o => o.trim())
                                    .filter(o => o.length > 0)
                                  updateInferredColumn(index, { dropdownOptions: options })
                                }}
                                placeholder="Option 1&#10;Option 2&#10;Option 3"
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-700">
                        <strong>Uniqueness:</strong> Each row is uniquely identified by the combination of ALL column values. 
                        Duplicate rows (where every column matches) will be automatically skipped during import.
                      </p>
                    </div>
                  </div>

                  {/* Sample data preview */}
                  {sampleRows.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">Sample Data Preview</h3>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={importSampleData}
                            onChange={(e) => setImportSampleData(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                          Import these {sampleRows.length} rows
                        </label>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                {inferredColumns.map(col => (
                                  <th key={col.key} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {sampleRows.slice(0, 5).map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {inferredColumns.map(col => (
                                    <td key={col.key} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                      {String(row[col.label] ?? "").substring(0, MAX_PREVIEW_VALUE_LENGTH)}
                                      {String(row[col.label] ?? "").length > MAX_PREVIEW_VALUE_LENGTH && "..."}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {sampleRows.length > 5 && (
                          <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-500">
                            Showing 5 of {sampleRows.length} sample rows
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Link href="/dashboard/databases">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button
              onClick={handleCreate}
              disabled={
                creating ||
                !name.trim() ||
                method === null ||
                (method === "manual" && columns.length === 0) ||
                (method === "upload" && inferredColumns.length === 0)
              }
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {creating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Create Database
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
