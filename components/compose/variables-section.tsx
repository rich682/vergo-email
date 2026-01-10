/**
 * Variables Section Component
 * 
 * Allows users to define custom variables (e.g., "Due Date", "Invoice Number")
 * that become tags for personalization. After defining variables, users can
 * upload a CSV to populate them.
 */

"use client"

import { useState, useRef } from "react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Plus } from "lucide-react"
import type { CSVParseResult } from "@/lib/utils/csv-parser"

interface VariablesSectionProps {
  variables: string[] // User-defined variable names (e.g., "Due Date", "Invoice Number")
  onVariablesChange: (variables: string[]) => void
  csvData: CSVParseResult | null
  onCSVUpload: (data: CSVParseResult, variableMapping: Record<string, string>) => void
  blockOnMissingValues: boolean
  onBlockOnMissingValuesChange: (value: boolean) => void
}

export function VariablesSection({
  variables,
  onVariablesChange,
  csvData,
  onCSVUpload,
  blockOnMissingValues,
  onBlockOnMissingValuesChange
}: VariablesSectionProps) {
  const [newVariable, setNewVariable] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({}) // Maps variable name -> CSV column name
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddVariable = () => {
    const trimmed = newVariable.trim()
    if (!trimmed) return
    
    // Check for duplicates (case-insensitive)
    if (variables.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
      setUploadError(`Variable "${trimmed}" already exists`)
      return
    }
    
    onVariablesChange([...variables, trimmed])
    setNewVariable("")
    setUploadError(null)
  }

  const handleRemoveVariable = (variableToRemove: string) => {
    const updated = variables.filter(v => v !== variableToRemove)
    onVariablesChange(updated)
    
    // Remove mapping if it exists
    const updatedMapping = { ...variableMapping }
    delete updatedMapping[variableToRemove]
    setVariableMapping(updatedMapping)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddVariable()
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setUploadError("Please select a CSV file")
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/email-drafts/csv-upload", {
        method: "POST",
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to upload CSV" }))
        throw new Error(errorData.error || "Failed to upload CSV")
      }

      const result = await response.json()
      if (result.success && result.data) {
        const parsedData = result.data as CSVParseResult
        
        // Auto-map CSV columns to variables if names match (case-insensitive)
        const autoMapping: Record<string, string> = {}
        const csvColumns = parsedData.tagColumns || []
        
        for (const variable of variables) {
          // Try to find a matching column (case-insensitive, with normalization)
          const matchingColumn = csvColumns.find(col => 
            col.toLowerCase().replace(/[^a-z0-9]/g, '') === variable.toLowerCase().replace(/[^a-z0-9]/g, '')
          )
          if (matchingColumn) {
            autoMapping[variable] = matchingColumn
          }
        }
        
        setVariableMapping(autoMapping)
        onCSVUpload(parsedData, autoMapping)
      } else {
        throw new Error("Invalid response from server")
      }
    } catch (error: any) {
      setUploadError(error.message || "Failed to upload CSV")
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleMappingChange = (variable: string, csvColumn: string) => {
    const updated = { ...variableMapping, [variable]: csvColumn }
    setVariableMapping(updated)
    
    // Update CSV data with new mapping if CSV already uploaded
    if (csvData) {
      onCSVUpload(csvData, updated)
    }
  }

  const csvColumns = csvData?.tagColumns || []

  return (
    <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div>
        <Label className="text-base font-semibold">Variables</Label>
        <p className="text-xs text-gray-500 mt-1">
          Define custom variables to personalize your request (e.g., "Due Date", "Invoice Number"). 
          These will become tags you can use in your message above.
        </p>
      </div>

      {/* Add Variable Input */}
      <div className="flex gap-2">
        <Input
          placeholder="e.g., Due Date, Invoice Number"
          value={newVariable}
          onChange={(e) => {
            setNewVariable(e.target.value)
            setUploadError(null)
          }}
          onKeyPress={handleKeyPress}
          className="flex-1"
        />
        <Button
          type="button"
          onClick={handleAddVariable}
          variant="outline"
          size="sm"
          disabled={!newVariable.trim()}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Defined Variables */}
      {variables.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-2 block">Defined Variables:</Label>
          <div className="flex flex-wrap gap-2">
            {variables.map((variable) => (
              <div
                key={variable}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium"
              >
                <span>{`{{${variable}}}`}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveVariable(variable)}
                  className="hover:bg-blue-200 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Use these variables in your message above by typing the variable name between double braces, 
            or use the "/" trigger in the preview panel.
          </p>
        </div>
      )}

      {/* CSV Upload Section - only show if variables are defined */}
      {variables.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-gray-200">
          <div>
            <Label htmlFor="csv-file" className="text-base font-semibold">Upload CSV</Label>
            <p className="text-xs text-gray-500 mt-1">
              Upload a CSV file with an email column and columns matching your variables. 
              CSV must have an email column (email, recipient_email, or recipientEmail).
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileSelect}
              disabled={uploading}
              className="flex-1"
            />
            {uploading && <span className="text-sm text-gray-500">Uploading...</span>}
          </div>

          {uploadError && (
            <p className="text-xs text-red-600 mt-1">{uploadError}</p>
          )}

          {/* CSV Upload Results */}
          {csvData && (
            <div className="space-y-3 mt-3 p-3 bg-white border border-gray-200 rounded-md">
              <div className="text-sm">
                <span className="font-medium">Email column:</span> {csvData.emailColumn}
              </div>
              <div className="text-sm">
                <span className="font-medium">Recipients:</span> {csvData.validation.rowCount}
              </div>

              {/* Variable to CSV Column Mapping */}
              {variables.length > 0 && csvColumns.length > 0 && (
                <div className="space-y-2 mt-3">
                  <Label className="text-sm font-medium">Map Variables to CSV Columns:</Label>
                  {variables.map((variable) => {
                    const mappedColumn = variableMapping[variable] || ""
                    return (
                      <div key={variable} className="flex items-center gap-2">
                        <Label className="text-xs w-32 flex-shrink-0">{`{{${variable}}}`}</Label>
                        <span className="text-xs text-gray-400">→</span>
                        <select
                          value={mappedColumn}
                          onChange={(e) => handleMappingChange(variable, e.target.value)}
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="">-- Select CSV column --</option>
                          {csvColumns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Missing Values Warning */}
              {Object.keys(csvData.validation.missingValues).length > 0 && (
                <div className="text-xs text-yellow-700 mt-2">
                  <div className="font-medium">Missing values per column:</div>
                  <ul className="list-disc list-inside mt-1">
                    {Object.entries(csvData.validation.missingValues).map(([col, count]) => (
                      <li key={col}>
                        {col}: {count} missing
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Block on Missing Values Toggle */}
      {variables.length > 0 && (
        <div className="flex items-center space-x-2 pt-2 border-t border-gray-200">
          <input
            type="checkbox"
            id="block-missing"
            checked={blockOnMissingValues}
            onChange={(e) => onBlockOnMissingValuesChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Label htmlFor="block-missing" className="text-sm font-normal cursor-pointer">
            Block send if required variables are missing
          </Label>
        </div>
      )}
    </div>
  )
}

