"use client"

import { useState, useCallback } from "react"
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
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  ArrowRight,
  ArrowDown,
  Sparkles,
  X,
  Link2,
  AlertCircle,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────

interface DetectedColumn {
  key: string
  label: string
  sampleValues: string[]
  suggestedType: "date" | "amount" | "text" | "reference"
}

interface FileAnalysis {
  fileName: string
  rowCount: number
  columns: DetectedColumn[]
  warnings: string[]
  file: File // keep original file for re-upload when creating run
}

interface ColumnMapping {
  sourceAKey: string
  sourceBKey: string
  type: "date" | "amount" | "text" | "reference"
  label: string
  tolerance?: number // ±$ for amount, ±days for date
}

interface ReconciliationSetupProps {
  /** "standalone" = config-only (builder page), "task" = config + run + matching (task tab) */
  mode?: "standalone" | "task"
  taskInstanceId?: string
  taskName?: string
  onCreated: (configId: string) => void
}

// ── Component ──────────────────────────────────────────────────────────

export function ReconciliationSetup({ mode = "task", taskInstanceId, taskName, onCreated }: ReconciliationSetupProps) {
  // Step tracking
  const [step, setStep] = useState<"upload" | "map" | "confirm">("upload")

  // File analysis results
  const [sourceA, setSourceA] = useState<FileAnalysis | null>(null)
  const [sourceB, setSourceB] = useState<FileAnalysis | null>(null)
  const [analyzingA, setAnalyzingA] = useState(false)
  const [analyzingB, setAnalyzingB] = useState(false)

  // Source labels
  const [sourceALabel, setSourceALabel] = useState("Source A")
  const [sourceBLabel, setSourceBLabel] = useState("Source B")

  // Column mappings (set after AI detection)
  const [mappings, setMappings] = useState<ColumnMapping[]>([])

  // Config name
  const [name, setName] = useState(taskName ? `${taskName} Reconciliation` : "")

  // State
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  // ── File Analysis ──────────────────────────────────────────────────

  const analyzeFile = useCallback(async (file: File, side: "A" | "B") => {
    const setter = side === "A" ? setAnalyzingA : setAnalyzingB
    const resultSetter = side === "A" ? setSourceA : setSourceB
    setter(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/reconciliations/analyze", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to analyze file")
      }

      const data = await res.json()
      resultSetter({
        fileName: data.fileName,
        rowCount: data.rowCount,
        columns: data.columns,
        warnings: data.warnings || [],
        file,
      })

      // Auto-set source label from filename
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ")
      if (side === "A") setSourceALabel(baseName)
      else setSourceBLabel(baseName)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setter(false)
    }
  }, [])

  // ── Auto-generate mappings when both files are analyzed ────────────

  const generateMappings = useCallback(() => {
    if (!sourceA || !sourceB) return

    const newMappings: ColumnMapping[] = []
    const usedB = new Set<string>()

    for (const colA of sourceA.columns) {
      // Try to find matching column in B by label similarity
      let bestMatch: DetectedColumn | null = null
      let bestScore = 0

      for (const colB of sourceB.columns) {
        if (usedB.has(colB.key)) continue

        // Score: exact label match = 100, case-insensitive = 80, contains = 50
        let score = 0
        if (colA.label === colB.label) score = 100
        else if (colA.label.toLowerCase() === colB.label.toLowerCase()) score = 80
        else if (
          colA.label.toLowerCase().includes(colB.label.toLowerCase()) ||
          colB.label.toLowerCase().includes(colA.label.toLowerCase())
        ) score = 50

        // Bonus for same suggested type — date and amount get a higher boost
        // so columns like "invoice_date" and "post_date" still auto-map
        if (colA.suggestedType === colB.suggestedType) {
          score += (colA.suggestedType === "date" || colA.suggestedType === "amount") ? 55 : 30
        }

        if (score > bestScore) {
          bestScore = score
          bestMatch = colB
        }
      }

      if (bestMatch && bestScore >= 50) {
        usedB.add(bestMatch.key)
        newMappings.push({
          sourceAKey: colA.key,
          sourceBKey: bestMatch.key,
          type: colA.suggestedType,
          label: colA.label,
        })
      }
    }

    setMappings(newMappings)
    setStep("map")
  }, [sourceA, sourceB])

  // ── Mapping helpers ────────────────────────────────────────────────

  const updateMappingType = (index: number, type: ColumnMapping["type"]) => {
    const updated = [...mappings]
    updated[index] = { ...updated[index], type, tolerance: undefined }
    setMappings(updated)
  }

  const updateMappingTolerance = (index: number, tolerance: number) => {
    const updated = [...mappings]
    updated[index] = { ...updated[index], tolerance }
    setMappings(updated)
  }

  const updateMappingBKey = (index: number, newBKey: string) => {
    const updated = [...mappings]
    updated[index] = { ...updated[index], sourceBKey: newBKey }
    setMappings(updated)
  }

  const removeMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index))
  }

  const addMapping = () => {
    setMappings([
      ...mappings,
      {
        sourceAKey: "",
        sourceBKey: "",
        type: "text",
        label: "",
      },
    ])
  }

  // ── Create & Run ──────────────────────────────────────────────────

  const handleCreate = async () => {
    const completeMappings = mappings.filter((m) => m.sourceAKey && m.sourceBKey)
    if (!sourceA || !sourceB || completeMappings.length === 0) return
    setCreating(true)
    setError("")

    try {
      // Build source configs from mappings
      const sourceAConfig = {
        label: sourceALabel,
        columns: completeMappings.map((m) => ({
          key: m.sourceAKey,
          label: m.label,
          type: m.type,
        })),
      }
      const sourceBConfig = {
        label: sourceBLabel,
        columns: completeMappings.map((m) => ({
          key: m.sourceBKey,
          label: m.label,
          type: m.type,
        })),
      }

      // Build matching rules from per-column tolerances
      const amountMapping = completeMappings.find((m) => m.type === "amount")
      const dateMapping = completeMappings.find((m) => m.type === "date")
      const amountTol = amountMapping?.tolerance || 0
      const dateTol = dateMapping?.tolerance || 0

      const columnTolerances: Record<string, { type: string; tolerance: number }> = {}
      for (const m of completeMappings) {
        if (m.tolerance !== undefined && m.tolerance > 0) {
          columnTolerances[m.sourceAKey] = { type: m.type, tolerance: m.tolerance }
        }
      }

      // 1. Create the config
      const configRes = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceAConfig,
          sourceBConfig,
          matchingRules: {
            amountMatch: amountTol > 0 ? "tolerance" : "exact",
            amountTolerance: amountTol,
            dateWindowDays: dateTol,
            fuzzyDescription: true,
            columnTolerances: Object.keys(columnTolerances).length > 0 ? columnTolerances : undefined,
          },
        }),
      })

      if (!configRes.ok) {
        const data = await configRes.json()
        throw new Error(data.error || "Failed to create reconciliation")
      }

      const { config } = await configRes.json()

      // 2. Create a run (both standalone and task mode)
      const runRes = await fetch(`/api/reconciliations/${config.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "task" ? { taskInstanceId } : {}),
      })

      if (!runRes.ok) throw new Error("Failed to create run")
      const { run } = await runRes.json()

      // 3. Upload both files to the run
      const uploadFile = async (file: File, source: "A" | "B") => {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("source", source)
        const res = await fetch(`/api/reconciliations/${config.id}/runs/${run.id}/upload`, {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || `Failed to upload ${source}`)
        }
      }

      await Promise.all([
        uploadFile(sourceA.file, "A"),
        uploadFile(sourceB.file, "B"),
      ])

      // 4. Trigger matching
      const matchRes = await fetch(`/api/reconciliations/${config.id}/runs/${run.id}/match`, {
        method: "POST",
      })

      if (!matchRes.ok) {
        // Matching failed but config/run exist -- still navigate
        console.error("Matching failed, but config was created")
      }

      onCreated(config.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Render: Step 1 - Upload ───────────────────────────────────────

  const DropZone = ({ side, analysis, analyzing }: {
    side: "A" | "B"
    analysis: FileAnalysis | null
    analyzing: boolean
  }) => {
    const [dragOver, setDragOver] = useState(false)

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) analyzeFile(file, side)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) analyzeFile(file, side)
    }

    if (analysis) {
      return (
        <div className="border border-green-200 bg-green-50 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-green-800">{analysis.fileName}</span>
          </div>
          <p className="text-xs text-green-600 mb-1">
            {analysis.rowCount} rows &middot; {analysis.columns.length} columns detected
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {analysis.columns.map((col) => (
              <span
                key={col.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700"
              >
                {col.label}
                <span className="text-green-500 text-[10px]">({col.suggestedType})</span>
              </span>
            ))}
          </div>
          <label className="mt-3 inline-block text-xs text-green-600 hover:text-green-700 cursor-pointer underline">
            Replace file
            <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>
      )
    }

    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300 bg-white"
        }`}
      >
        {analyzing ? (
          <>
            <Loader2 className="w-8 h-8 text-orange-500 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-gray-600">Analyzing file...</p>
            <p className="text-xs text-gray-400 mt-1">Detecting columns and data types</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">
              {side === "A" ? "Source A — Source of Truth" : "Source B — Comparison"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {side === "A" ? "e.g. ERP, General Ledger, AP report" : "e.g. Bank statement, card feed"}
            </p>
            <p className="text-[10px] text-gray-300 mt-0.5">Drop CSV, Excel, or PDF</p>
            <label className="mt-3 inline-block">
              <span className="text-xs text-orange-500 hover:text-orange-600 cursor-pointer underline">
                Browse files
              </span>
              <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileSelect} />
            </label>
          </>
        )}
      </div>
    )
  }

  if (step === "upload") {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Files to Reconcile</h3>
          <p className="text-sm text-gray-500">
            Upload both reports and AI will automatically detect the columns and data types.
            Source A is your source of truth — unmatched Source A rows will appear in the &ldquo;Not Matched&rdquo; tab.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <DropZone side="A" analysis={sourceA} analyzing={analyzingA} />
          <DropZone side="B" analysis={sourceB} analyzing={analyzingB} />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {sourceA && sourceB && (
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span>AI detected {sourceA.columns.length} + {sourceB.columns.length} columns</span>
            </div>
            <Button
              onClick={generateMappings}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Map Columns <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ── Render: Step 2 - Column Mapping ───────────────────────────────

  if (step === "map") {
    const hasAvailableA = (sourceA?.columns.filter(
      (c) => !mappings.some((m) => m.sourceAKey === c.key)
    ).length ?? 0) > 0
    const hasAvailableB = (sourceB?.columns.filter(
      (c) => !mappings.some((m) => m.sourceBKey === c.key)
    ).length ?? 0) > 0
    const hasIncompleteMapping = mappings.some((m) => !m.sourceAKey || !m.sourceBKey)

    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Map Columns</h3>
          <p className="text-sm text-gray-500">
            AI has suggested how columns from each file match up. Adjust the mappings, set tolerances, and mark columns as relevant or ignored.
          </p>
        </div>

        {/* Reconciliation Name — at the top */}
        <div>
          <Label className="text-xs text-gray-500">Reconciliation Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-8 text-sm"
            placeholder="e.g. Chase Checking Bank Rec"
          />
        </div>

        {/* Source labels */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label className="text-xs text-gray-500">Source A label</Label>
            <Input
              value={sourceALabel}
              onChange={(e) => setSourceALabel(e.target.value)}
              className="mt-1 h-8 text-sm"
              placeholder="e.g. Bank Statement"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Source B label</Label>
            <Input
              value={sourceBLabel}
              onChange={(e) => setSourceBLabel(e.target.value)}
              className="mt-1 h-8 text-sm"
              placeholder="e.g. General Ledger"
            />
          </div>
        </div>

        {/* Matching fields */}
        <div>
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">Matching Fields</h4>
              <span className="text-xs text-gray-400">{mappings.filter((m) => m.sourceAKey && m.sourceBKey).length} field{mappings.filter((m) => m.sourceAKey && m.sourceBKey).length !== 1 ? "s" : ""}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              These are the fields compared across both sources to identify matches, potential matches, and orphans.
            </p>
          </div>

          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[1fr_32px_1fr_100px_120px_32px] gap-2 items-center px-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{sourceALabel}</span>
              <span />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{sourceBLabel}</span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tolerance</span>
              <span />
            </div>

            {mappings.map((mapping, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_32px_1fr_100px_120px_32px] gap-2 items-center bg-gray-50 rounded-lg px-2 py-1.5"
              >
                {/* Source A column */}
                <div>
                  <Select
                    value={mapping.sourceAKey || undefined}
                    onValueChange={(v) => {
                      const updated = [...mappings]
                      const col = sourceA?.columns.find((c) => c.key === v)
                      updated[i] = { ...updated[i], sourceAKey: v, label: col?.label || v, type: col?.suggestedType || updated[i].type }
                      setMappings(updated)
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceA?.columns
                        .filter((col) => col.key === mapping.sourceAKey || !mappings.some((m) => m.sourceAKey === col.key))
                        .map((col) => (
                          <SelectItem key={col.key} value={col.key}>
                            {col.label}
                            <span className="ml-1 text-gray-400">({col.sampleValues[0] || ""})</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <Link2 className="w-3.5 h-3.5 text-gray-400" />
                </div>

                {/* Source B column */}
                <div>
                  <Select value={mapping.sourceBKey || undefined} onValueChange={(v) => updateMappingBKey(i, v)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceB?.columns
                        .filter((col) => col.key === mapping.sourceBKey || !mappings.some((m) => m.sourceBKey === col.key))
                        .map((col) => (
                          <SelectItem key={col.key} value={col.key}>
                            {col.label}
                            <span className="ml-1 text-gray-400">({col.sampleValues[0] || ""})</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type */}
                <Select value={mapping.type} onValueChange={(v) => updateMappingType(i, v as any)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="reference">Reference</SelectItem>
                  </SelectContent>
                </Select>

                {/* Tolerance — contextual per type */}
                <div>
                  {mapping.type === "amount" ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">±$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mapping.tolerance ?? 0}
                        onChange={(e) => updateMappingTolerance(i, Number(e.target.value))}
                        className="h-7 text-xs w-full"
                        placeholder="0"
                      />
                    </div>
                  ) : mapping.type === "date" ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">±</span>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={mapping.tolerance ?? 0}
                        onChange={(e) => updateMappingTolerance(i, Number(e.target.value))}
                        className="h-7 text-xs w-16"
                        placeholder="0"
                      />
                      <span className="text-xs text-gray-400">days</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 px-1">Exact</span>
                  )}
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeMapping(i)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Add mapping button */}
            {(hasAvailableA || hasAvailableB) && !hasIncompleteMapping && (
              <button
                onClick={addMapping}
                className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 px-2 py-1"
              >
                + Add matching field
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setStep("upload")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to files
          </button>
          <Button
            onClick={handleCreate}
            disabled={creating || mappings.length === 0 || hasIncompleteMapping}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating & matching...
              </>
            ) : (
              <>
                Run Reconciliation <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
