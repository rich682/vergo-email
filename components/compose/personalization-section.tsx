/**
 * Personalization Section Component
 * 
 * Handles personalization mode selection and CSV upload for personalized requests.
 * Supports: None, Contact fields, CSV upload
 */

"use client"

import { useState, useRef } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { CSVParseResult } from "@/lib/utils/csv-parser"

export type PersonalizationMode = "none" | "contact" | "csv"

interface PersonalizationSectionProps {
  mode: PersonalizationMode
  onModeChange: (mode: PersonalizationMode) => void
  csvData: CSVParseResult | null
  onCSVUpload: (data: CSVParseResult) => void
  availableTags: string[]
  blockOnMissingValues: boolean
  onBlockOnMissingValuesChange: (value: boolean) => void
}

export function PersonalizationSection({
  mode,
  onModeChange,
  csvData,
  onCSVUpload,
  availableTags,
  blockOnMissingValues,
  onBlockOnMissingValuesChange
}: PersonalizationSectionProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        onCSVUpload(result.data)
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

  return (
    <div className="space-y-4">
      <div>
        <Label>Personalization</Label>
        <Select value={mode} onValueChange={(value) => onModeChange(value as PersonalizationMode)}>
          <SelectTrigger>
            <SelectValue placeholder="Select personalization mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No personalization</SelectItem>
            <SelectItem value="contact">Use contact fields</SelectItem>
            <SelectItem value="csv">Upload CSV</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500 mt-1">
          Personalize emails with recipient-specific data (e.g., invoice numbers, due dates)
        </p>
      </div>

      {mode === "csv" && (
        <div className="space-y-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div>
            <Label htmlFor="csv-file">Upload CSV</Label>
            <div className="flex items-center gap-2 mt-1">
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
            <p className="text-xs text-gray-500 mt-1">
              CSV must have an email column (email, recipient_email, or recipientEmail). All other columns become tags.
            </p>
            {uploadError && (
              <p className="text-xs text-red-600 mt-1">{uploadError}</p>
            )}
          </div>

          {csvData && (
            <div className="space-y-2 mt-3">
              <div className="text-sm">
                <span className="font-medium">Email column:</span> {csvData.emailColumn}
              </div>
              <div className="text-sm">
                <span className="font-medium">Recipients:</span> {csvData.validation.rowCount}
              </div>
              
              {availableTags.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Available tags:</div>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-medium"
                      >
                        {`{{${tag}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

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

      {mode === "contact" && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-700">
            Emails will use contact fields: First Name, Email
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {["First Name", "Email"].map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-medium"
              >
                {`{{${tag}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {(mode === "csv" || mode === "contact") && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="block-missing"
            checked={blockOnMissingValues}
            onChange={(e) => onBlockOnMissingValuesChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Label htmlFor="block-missing" className="text-sm font-normal cursor-pointer">
            Block send if required tags are missing
          </Label>
        </div>
      )}
    </div>
  )
}

