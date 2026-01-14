"use client"

import { useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  Plus,
  ChevronRight,
} from "lucide-react"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

interface DraftStepProps {
  jobId: string
  draftId: string
  columns: DatasetColumn[]
  rows: DatasetRow[]
  validation: DatasetValidation
  onColumnsChange: (columns: DatasetColumn[]) => void
  onContinue: (data: { subject: string; body: string }) => void
  onBack: () => void
}

type DraftState = "idle" | "generating" | "ready" | "refining" | "error"

export function DraftStep({
  jobId,
  draftId,
  columns,
  rows,
  validation,
  onColumnsChange,
  onContinue,
  onBack,
}: DraftStepProps) {
  const [state, setState] = useState<DraftState>("idle")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [userGoal, setUserGoal] = useState("")
  const [error, setError] = useState<string | null>(null)
  
  // Column analysis
  const [usedColumns, setUsedColumns] = useState<string[]>([])
  const [unusedColumns, setUnusedColumns] = useState<string[]>([])
  
  // Refinement
  const [refinementInstruction, setRefinementInstruction] = useState("")
  
  // Add column modal
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState("")
  const [newColumnType, setNewColumnType] = useState<DatasetColumn["type"]>("text")
  const [newColumnDefault, setNewColumnDefault] = useState("")
  const [addingColumn, setAddingColumn] = useState(false)
  
  // Refs for cursor position
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [activeField, setActiveField] = useState<"subject" | "body">("body")

  // Generate draft
  const generateDraft = useCallback(async () => {
    setState("generating")
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/request/dataset/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          userGoal: userGoal.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to generate draft")
      }

      const data = await response.json()
      
      setSubject(data.subject)
      setBody(data.body)
      setUsedColumns(data.usedColumns || [])
      setUnusedColumns(data.unusedColumns || [])
      setRefinementInstruction("") // Clear refinement after generation
      setState("ready")
    } catch (err: any) {
      console.error("Draft generation error:", err)
      setError(err.message || "Failed to generate draft")
      setState("error")
    }
  }, [jobId, draftId, userGoal])

  // Refine draft
  const refineDraft = useCallback(async () => {
    if (!refinementInstruction.trim()) return
    
    setState("refining")
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/request/dataset/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          userGoal: refinementInstruction.trim(),
          currentDraft: { subject, body }, // Pass current draft for refinement context
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to refine draft")
      }

      const data = await response.json()
      
      setSubject(data.subject)
      setBody(data.body)
      setUsedColumns(data.usedColumns || [])
      setUnusedColumns(data.unusedColumns || [])
      setRefinementInstruction("")
      setState("ready")
    } catch (err: any) {
      console.error("Refine error:", err)
      setError(err.message || "Failed to refine draft")
      setState("ready")
    }
  }, [jobId, draftId, refinementInstruction, subject, body])

  // Insert field at cursor
  const insertField = (columnKey: string) => {
    const fieldToken = `{{${columnKey}}}`
    
    if (activeField === "subject" && subjectRef.current) {
      const input = subjectRef.current
      const start = input.selectionStart || 0
      const end = input.selectionEnd || 0
      const newValue = subject.slice(0, start) + fieldToken + subject.slice(end)
      setSubject(newValue)
      
      // Restore cursor position
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + fieldToken.length, start + fieldToken.length)
      }, 0)
    } else if (activeField === "body" && bodyRef.current) {
      const textarea = bodyRef.current
      const start = textarea.selectionStart || 0
      const end = textarea.selectionEnd || 0
      const newValue = body.slice(0, start) + fieldToken + body.slice(end)
      setBody(newValue)
      
      // Restore cursor position
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + fieldToken.length, start + fieldToken.length)
      }, 0)
    }
  }

  // Add new column
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return
    
    // Normalize key
    const columnKey = newColumnName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")

    if (columns.some(c => c.key === columnKey)) {
      setError("A column with this name already exists")
      return
    }

    setAddingColumn(true)
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/request/dataset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          action: "add_column",
          payload: {
            columnKey,
            columnLabel: newColumnName.trim(),
            columnType: newColumnType,
            defaultValue: newColumnDefault.trim() || undefined,
          },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add column")
      }

      // Update local columns
      const newColumn: DatasetColumn = {
        key: columnKey,
        label: newColumnName.trim(),
        type: newColumnType,
      }
      onColumnsChange([...columns, newColumn])
      
      // Add to unused columns
      setUnusedColumns(prev => [...prev, columnKey])
      
      // Remove from suggested if it was there
      setSuggestedMissingColumns(prev => 
        prev.filter(s => s.name.toLowerCase().replace(/\s+/g, "_") !== columnKey)
      )

      // Reset modal
      setShowAddColumn(false)
      setNewColumnName("")
      setNewColumnType("text")
      setNewColumnDefault("")
    } catch (err: any) {
      console.error("Add column error:", err)
      setError(err.message || "Failed to add column")
    } finally {
      setAddingColumn(false)
    }
  }

  // Save draft and continue
  const handleContinue = async () => {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required")
      return
    }

    // Save draft to backend
    try {
      const response = await fetch(`/api/jobs/${jobId}/request/dataset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          action: "update_draft",
          payload: {
            subject: subject.trim(),
            body: body.trim(),
          },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save draft")
      }

      onContinue({ subject: subject.trim(), body: body.trim() })
    } catch (err: any) {
      console.error("Save draft error:", err)
      setError(err.message || "Failed to save draft")
    }
  }

  return (
    <div className="space-y-6">
      {/* Generate Draft Section */}
      {state === "idle" && (
        <div className="border rounded-lg p-6 text-center">
          <Sparkles className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Generate AI Draft</h3>
          <p className="text-sm text-gray-500 mb-4">
            AI will create a personalized email template using your dataset columns.
          </p>
          
          <div className="max-w-md mx-auto mb-4">
            <Label className="text-left block mb-2 text-sm">
              What would you like to communicate? (optional)
            </Label>
            <Textarea
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              placeholder="e.g., Request payment for outstanding invoices, remind about upcoming deadline..."
              className="resize-none"
              rows={2}
            />
          </div>
          
          <Button onClick={generateDraft}>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Draft
          </Button>
        </div>
      )}

      {/* Generating State */}
      {state === "generating" && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-orange-500 animate-pulse" />
          </div>
          <p className="text-gray-600">Generating personalized draft...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a few seconds</p>
        </div>
      )}

      {/* Draft Editor */}
      {(state === "ready" || state === "error") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Editor */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <Label className="mb-2 block">Subject</Label>
              <Input
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => setActiveField("subject")}
                placeholder="Email subject..."
                className="font-medium"
              />
            </div>
            
            <div>
              <Label className="mb-2 block">Body</Label>
              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setActiveField("body")}
                placeholder="Email body..."
                className="min-h-[300px] font-mono text-sm"
                style={{ fontFamily: "Arial, sans-serif" }}
              />
            </div>

            {/* Refinement Section */}
            <div className="border-t pt-4 space-y-3">
              <Label className="flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-orange-500" />
                Refine with AI (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={refinementInstruction}
                  onChange={(e) => setRefinementInstruction(e.target.value)}
                  placeholder="e.g., make it more polite, add urgency, shorten the email..."
                  disabled={state === "refining"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && refinementInstruction.trim()) {
                      e.preventDefault()
                      refineDraft()
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={refineDraft}
                  disabled={!refinementInstruction.trim() || state === "refining"}
                >
                  {state === "refining" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Refine"
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Use merge fields like {"{{first_name}}"} for personalization
              </p>
            </div>
          </div>

          {/* Side Panel - Fields */}
          <div className="space-y-4">
            {/* Insert Field */}
            <div className="border rounded-lg p-4">
              <Label className="mb-3 block font-medium">Insert Field</Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {columns.map((col) => (
                  <button
                    key={col.key}
                    onClick={() => insertField(col.key)}
                    className={`
                      w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                      ${usedColumns.includes(col.key) 
                        ? "bg-green-50 text-green-700 hover:bg-green-100" 
                        : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{`{{${col.key}}}`}</span>
                      {usedColumns.includes(col.key) && (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{col.label}</span>
                  </button>
                ))}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => setShowAddColumn(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Column
              </Button>
            </div>

            {/* Column Stats */}
            <div className="border rounded-lg p-4">
              <Label className="mb-2 block font-medium">Column Usage</Label>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Used in draft</span>
                  <span className="font-medium text-green-600">{usedColumns.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Available</span>
                  <span className="font-medium text-gray-600">{columns.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Recipients</span>
                  <span className="font-medium text-gray-900">{validation.validEmails}</span>
                </div>
              </div>
            </div>
          </div>
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
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!subject.trim() || !body.trim() || state === "generating"}
        >
          Continue to Preview
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Add Column Modal */}
      <Dialog open={showAddColumn} onOpenChange={setShowAddColumn}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block">Column Name</Label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="e.g., Invoice Number"
              />
            </div>
            <div>
              <Label className="mb-2 block">Type</Label>
              <Select value={newColumnType} onValueChange={(v) => setNewColumnType(v as DatasetColumn["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Default Value (optional)</Label>
              <Input
                value={newColumnDefault}
                onChange={(e) => setNewColumnDefault(e.target.value)}
                placeholder="Value for all rows"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddColumn(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim() || addingColumn}>
              {addingColumn ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
