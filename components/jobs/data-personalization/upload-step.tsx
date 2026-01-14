"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Mail,
  Users,
  AlertTriangle,
} from "lucide-react"
import {
  parseDataset,
  isDatasetParseError,
  detectEmailColumn,
  type DatasetColumn,
  type DatasetRow,
  type DatasetParseResult,
  type DatasetValidation,
} from "@/lib/utils/dataset-parser"

interface UploadStepProps {
  jobId: string
  onUploadComplete: (data: {
    draftId: string
    columns: DatasetColumn[]
    rows: DatasetRow[]
    emailColumn: string
    validation: DatasetValidation
  }) => void
  onCancel: () => void
}

type UploadState = "idle" | "parsing" | "uploading" | "error"

export function UploadStep({ jobId, onUploadComplete, onCancel }: UploadStepProps) {
  const [state, setState] = useState<UploadState>("idle")
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Parsed data
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [detectedEmailColumn, setDetectedEmailColumn] = useState<string | null>(null)
  const [selectedEmailColumn, setSelectedEmailColumn] = useState<string>("")
  const [parseResult, setParseResult] = useState<DatasetParseResult | null>(null)

  const resetState = () => {
    setState("idle")
    setFileName(null)
    setError(null)
    setRawRows([])
    setHeaders([])
    setDetectedEmailColumn(null)
    setSelectedEmailColumn("")
    setParseResult(null)
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

      if (nonEmptyRows.length < 2) {
        setError("The spreadsheet needs at least a header row and one data row")
        setState("error")
        return
      }

      // Extract headers
      const headerRow = nonEmptyRows[0].map(h => (h || "").toString().trim())
      setHeaders(headerRow)
      setRawRows(nonEmptyRows)

      // Auto-detect email column
      const detected = detectEmailColumn(headerRow, nonEmptyRows.slice(1))
      setDetectedEmailColumn(detected)
      setSelectedEmailColumn(detected || "")

      // Parse with detected email column
      if (detected) {
        const result = parseDataset(nonEmptyRows, detected)
        if (isDatasetParseError(result)) {
          setError(result.message)
          setState("error")
          return
        }
        setParseResult(result)
      }

      setState("idle")
    } catch (err: any) {
      console.error("File parsing error:", err)
      setError(err.message || "Failed to parse file")
      setState("error")
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
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  // Handle email column change
  const handleEmailColumnChange = (value: string) => {
    setSelectedEmailColumn(value)
    setError(null)

    if (rawRows.length > 0) {
      const result = parseDataset(rawRows, value)
      if (isDatasetParseError(result)) {
        setError(result.message)
        setParseResult(null)
        return
      }
      setParseResult(result)
    }
  }

  // Handle upload to backend
  const handleContinue = async () => {
    if (!parseResult) {
      setError("Please select a valid email column")
      return
    }

    setState("uploading")
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/request/dataset/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          columns: parseResult.columns,
          rows: parseResult.rows,
          emailColumn: parseResult.emailColumn,
          emailColumnKey: parseResult.emailColumnKey,
          validation: parseResult.validation,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to upload dataset")
      }

      const data = await response.json()
      
      onUploadComplete({
        draftId: data.draftId,
        columns: parseResult.columns,
        rows: parseResult.rows,
        emailColumn: parseResult.emailColumn,
        validation: parseResult.validation,
      })
    } catch (err: any) {
      console.error("Upload error:", err)
      setError(err.message || "Failed to upload dataset")
      setState("error")
    }
  }

  // Preview data (first 10 rows)
  const previewRows = parseResult?.rows.slice(0, 10) || []
  const previewColumns = parseResult?.columns.slice(0, 5) || []

  return (
    <div className="space-y-6">
      {/* File Upload Zone */}
      {!fileName && (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? "border-orange-500 bg-orange-50" : "border-gray-300 hover:border-gray-400"}
          `}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600 mb-2">
            {isDragActive
              ? "Drop the file here..."
              : "Drag & drop a CSV or Excel file, or click to select"}
          </p>
          <p className="text-xs text-gray-500">
            Supports .csv, .xlsx, .xls (max 10MB, 5000 rows)
          </p>
        </div>
      )}

      {/* File Selected */}
      {fileName && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">{fileName}</p>
                <p className="text-sm text-gray-500">
                  {rawRows.length - 1} data rows, {headers.length} columns
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetState}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Parsing State */}
      {state === "parsing" && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin mr-2" />
          <span className="text-gray-600">Parsing file...</span>
        </div>
      )}

      {/* Email Column Selection */}
      {fileName && headers.length > 0 && state !== "parsing" && (
        <div className="space-y-4">
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-gray-500" />
              Email Column
            </Label>
            <Select value={selectedEmailColumn} onValueChange={handleEmailColumnChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select the column containing email addresses" />
              </SelectTrigger>
              <SelectContent>
                {headers.map((header, index) => (
                  <SelectItem key={index} value={header}>
                    {header}
                    {header === detectedEmailColumn && (
                      <span className="ml-2 text-xs text-green-600">(detected)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Validation Summary */}
          {parseResult && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <Users className="w-3 h-3" />
                  Total Rows
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {parseResult.validation.totalRows}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                  <CheckCircle className="w-3 h-3" />
                  Valid Emails
                </div>
                <div className="text-lg font-semibold text-green-700">
                  {parseResult.validation.validEmails}
                </div>
              </div>
              {parseResult.validation.invalidEmails.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-600 text-xs mb-1">
                    <AlertCircle className="w-3 h-3" />
                    Invalid
                  </div>
                  <div className="text-lg font-semibold text-red-700">
                    {parseResult.validation.invalidEmails.length}
                  </div>
                </div>
              )}
              {parseResult.validation.duplicates.length > 0 && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
                    <AlertTriangle className="w-3 h-3" />
                    Duplicates
                  </div>
                  <div className="text-lg font-semibold text-amber-700">
                    {parseResult.validation.duplicates.length}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Data Preview */}
          {parseResult && previewRows.length > 0 && (
            <div>
              <Label className="mb-2 block">Data Preview (first 10 rows)</Label>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
                        {previewColumns.map((col, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-gray-600">
                            {col.label}
                            <span className="ml-1 text-xs text-gray-400">({col.type})</span>
                          </th>
                        ))}
                        {parseResult.columns.length > 5 && (
                          <th className="px-3 py-2 text-left font-medium text-gray-400">
                            +{parseResult.columns.length - 5} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={!row.valid ? "bg-red-50" : ""}>
                          <td className="px-3 py-2 text-gray-900">
                            {row.email || <span className="text-red-500 text-xs">Missing</span>}
                          </td>
                          {previewColumns.map((col, colIndex) => (
                            <td key={colIndex} className="px-3 py-2 text-gray-600 truncate max-w-[150px]">
                              {row.values[col.key] || <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          {parseResult.columns.length > 5 && (
                            <td className="px-3 py-2 text-gray-400">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!parseResult || parseResult.validation.validEmails === 0 || state === "uploading"}
        >
          {state === "uploading" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              Continue
              <span className="ml-2 text-xs opacity-75">
                ({parseResult?.validation.validEmails || 0} recipients)
              </span>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
