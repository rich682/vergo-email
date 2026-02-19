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
  Database,
  Files,
} from "lucide-react"
import { DatabaseSourcePicker, type DatabaseAnalysis } from "./database-source-picker"

// ── Types ──────────────────────────────────────────────────────────────

type SourceType = "document_document" | "database_document" | "database_database"

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
  isPeriodIdentifier?: boolean
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
  const [step, setStep] = useState<"source_type" | "upload" | "map" | "confirm">("source_type")

  // Source type selection
  const [sourceType, setSourceType] = useState<SourceType>("document_document")

  // File analysis results (for document sources)
  const [sourceA, setSourceA] = useState<FileAnalysis | null>(null)
  const [sourceB, setSourceB] = useState<FileAnalysis | null>(null)
  const [analyzingA, setAnalyzingA] = useState(false)
  const [analyzingB, setAnalyzingB] = useState(false)

  // Database analysis results (for database sources)
  const [dbAnalysisA, setDbAnalysisA] = useState<DatabaseAnalysis | null>(null)
  const [dbAnalysisB, setDbAnalysisB] = useState<DatabaseAnalysis | null>(null)

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

  // ── Source type helpers ──────────────────────────────────────────────

  const sourceAIsDatabase = sourceType === "database_document" || sourceType === "database_database"
  const sourceBIsDatabase = sourceType === "database_database"

  // Get the columns for mapping (from file or database analysis)
  const getSourceAColumns = (): DetectedColumn[] => {
    if (sourceAIsDatabase) return dbAnalysisA?.columns || []
    return sourceA?.columns || []
  }
  const getSourceBColumns = (): DetectedColumn[] => {
    if (sourceBIsDatabase) return dbAnalysisB?.columns || []
    return sourceB?.columns || []
  }

  const sourceAReady = sourceAIsDatabase ? !!dbAnalysisA : !!sourceA
  const sourceBReady = sourceBIsDatabase ? !!dbAnalysisB : !!sourceB

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

  // ── Database analysis handlers ────────────────────────────────────

  const handleDbAnalyzedA = useCallback((analysis: DatabaseAnalysis) => {
    setDbAnalysisA(analysis)
    setSourceALabel(analysis.databaseName)
  }, [])

  const handleDbAnalyzedB = useCallback((analysis: DatabaseAnalysis) => {
    setDbAnalysisB(analysis)
    setSourceBLabel(analysis.databaseName)
  }, [])

  // ── Auto-generate mappings when both sources are ready ────────────

  const generateMappings = useCallback(() => {
    const colsA = getSourceAColumns()
    const colsB = getSourceBColumns()
    if (colsA.length === 0 || colsB.length === 0) return

    const newMappings: ColumnMapping[] = []
    const usedB = new Set<string>()

    for (const colA of colsA) {
      // Try to find matching column in B by label similarity
      let bestMatch: DetectedColumn | null = null
      let bestScore = 0

      for (const colB of colsB) {
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
  }, [sourceA, sourceB, dbAnalysisA, dbAnalysisB, sourceType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mapping helpers ────────────────────────────────────────────────

  const updateMappingType = (index: number, type: ColumnMapping["type"]) => {
    const updated = [...mappings]
    updated[index] = { ...updated[index], type, isPeriodIdentifier: type === "date" ? updated[index].isPeriodIdentifier : undefined }
    setMappings(updated)
  }

  const updatePeriodIdentifier = (index: number, value: boolean) => {
    const updated = mappings.map((m, i) => {
      if (i === index) return { ...m, isPeriodIdentifier: value }
      // Only one period identifier allowed — clear others
      if (value && m.isPeriodIdentifier) return { ...m, isPeriodIdentifier: false }
      return m
    })
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
    const colsA = getSourceAColumns()
    const colsB = getSourceBColumns()
    if (colsA.length === 0 || colsB.length === 0) return
    const unusedA = colsA.filter(
      (c) => !mappings.some((m) => m.sourceAKey === c.key)
    )
    const unusedB = colsB.filter(
      (c) => !mappings.some((m) => m.sourceBKey === c.key)
    )
    if (unusedA.length > 0 && unusedB.length > 0) {
      setMappings([
        ...mappings,
        {
          sourceAKey: unusedA[0].key,
          sourceBKey: unusedB[0].key,
          type: unusedA[0].suggestedType,
          label: unusedA[0].label,
        },
      ])
    }
  }

  // ── Create & Run ──────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!sourceAReady || !sourceBReady || mappings.length === 0) return
    setCreating(true)
    setError("")

    try {
      // Build source configs from mappings
      const sourceAConfig: Record<string, any> = {
        label: sourceALabel,
        columns: mappings.map((m) => ({
          key: m.sourceAKey,
          label: m.label,
          type: m.type,
        })),
      }
      const sourceBConfig: Record<string, any> = {
        label: sourceBLabel,
        columns: mappings.map((m) => ({
          key: m.sourceBKey,
          label: m.label,
          type: m.type,
        })),
      }

      // Add database metadata to source configs if applicable
      // Period identifier: find the mapping marked as period identifier
      const periodMapping = mappings.find((m) => m.isPeriodIdentifier)

      if (sourceAIsDatabase && dbAnalysisA) {
        sourceAConfig.sourceType = "database"
        sourceAConfig.databaseId = dbAnalysisA.databaseId
        if (periodMapping) {
          sourceAConfig.dateColumnKey = periodMapping.sourceAKey
          sourceAConfig.cadence = "monthly"
        }
      } else {
        sourceAConfig.sourceType = "file"
      }

      if (sourceBIsDatabase && dbAnalysisB) {
        sourceBConfig.sourceType = "database"
        sourceBConfig.databaseId = dbAnalysisB.databaseId
        if (periodMapping) {
          sourceBConfig.dateColumnKey = periodMapping.sourceBKey
          sourceBConfig.cadence = "monthly"
        }
      } else {
        sourceBConfig.sourceType = "file"
      }

      // 1. Create the config
      const configRes = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceType,
          sourceAConfig,
          sourceBConfig,
          matchingRules: {
            amountMatch: "exact",
            amountTolerance: 0,
            dateWindowDays: 0,
            fuzzyDescription: true,
          },
        }),
      })

      if (!configRes.ok) {
        let errorMsg = "Failed to create reconciliation"
        try {
          const data = await configRes.json()
          errorMsg = data.error || errorMsg
        } catch {
          if (configRes.status === 409) {
            errorMsg = "A reconciliation with this name already exists. Please choose a different name."
          } else {
            errorMsg = `${errorMsg} (HTTP ${configRes.status})`
          }
        }
        throw new Error(errorMsg)
      }

      const { config } = await configRes.json()

      // 2. Create a run (both standalone and task mode)
      const runRes = await fetch(`/api/reconciliations/${config.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "task" ? { taskInstanceId } : {}),
      })

      if (!runRes.ok) {
        let errorMsg = "Failed to create run"
        try { const data = await runRes.json(); errorMsg = data.error || errorMsg } catch {}
        throw new Error(errorMsg)
      }
      const { run } = await runRes.json()

      // 3. Load data into the run based on source type
      const hasDatabaseSources = sourceAIsDatabase || sourceBIsDatabase

      if (hasDatabaseSources) {
        // Load database rows via load-database endpoint
        const loadRes = await fetch(`/api/reconciliations/${config.id}/runs/${run.id}/load-database`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        if (!loadRes.ok) {
          let errorMsg = "Failed to load database rows"
          try { const data = await loadRes.json(); errorMsg = data.error || errorMsg } catch {}
          throw new Error(errorMsg)
        }
      }

      // Upload any file sources
      const uploadFile = async (file: File, source: "A" | "B") => {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("source", source)
        const res = await fetch(`/api/reconciliations/${config.id}/runs/${run.id}/upload`, {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          let errorMsg = `Failed to upload source ${source}`
          try { const data = await res.json(); errorMsg = data.error || errorMsg } catch {}
          throw new Error(errorMsg)
        }
      }

      const fileUploads: Promise<void>[] = []
      if (!sourceAIsDatabase && sourceA) fileUploads.push(uploadFile(sourceA.file, "A"))
      if (!sourceBIsDatabase && sourceB) fileUploads.push(uploadFile(sourceB.file, "B"))
      if (fileUploads.length > 0) await Promise.all(fileUploads)

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
      if (err.message === "Failed to fetch" || err.name === "TypeError") {
        setError("Network error — please check your connection and try again. If a reconciliation with this name already exists, try a different name.")
      } else {
        setError(err.message)
      }
    } finally {
      setCreating(false)
    }
  }

  // ── Render: Step 0 - Source Type ────────────────────────────────────

  if (step === "source_type") {
    const SOURCE_TYPE_OPTIONS: { value: SourceType; title: string; description: string; icon: React.ReactNode }[] = [
      {
        value: "document_document",
        title: "Document vs Document",
        description: "Reconcile two uploaded files (CSV, Excel, PDF)",
        icon: <Files className="w-6 h-6" />,
      },
      {
        value: "database_document",
        title: "Database vs Document",
        description: "Reconcile a connected database against an uploaded file",
        icon: (
          <div className="flex items-center gap-1">
            <Database className="w-5 h-5" />
            <span className="text-gray-300 text-xs">&times;</span>
            <FileText className="w-5 h-5" />
          </div>
        ),
      },
      {
        value: "database_database",
        title: "Database vs Database",
        description: "Reconcile two connected databases — required for AI agent automation",
        icon: (
          <div className="flex items-center gap-1">
            <Database className="w-5 h-5" />
            <span className="text-gray-300 text-xs">&times;</span>
            <Database className="w-5 h-5" />
          </div>
        ),
      },
    ]

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Choose Source Type</h3>
          <p className="text-sm text-gray-500">
            Select how you want to provide data for this reconciliation.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {SOURCE_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setSourceType(option.value)
                // Reset sources when switching type
                setSourceA(null)
                setSourceB(null)
                setDbAnalysisA(null)
                setDbAnalysisB(null)
                setSourceALabel("Source A")
                setSourceBLabel("Source B")
                setMappings([])
                setStep("upload")
              }}
              className={`flex items-start gap-4 p-5 rounded-xl border-2 text-left transition-all hover:border-orange-300 hover:bg-orange-50/50 ${
                sourceType === option.value
                  ? "border-orange-400 bg-orange-50/50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                {option.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900">{option.title}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Render: Step 1 - Upload / Select Sources ───────────────────────

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
    const sourceTypeLabel =
      sourceType === "document_document" ? "Document vs Document" :
      sourceType === "database_document" ? "Database vs Document" :
      "Database vs Database"

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-gray-900">
              {sourceType === "document_document" ? "Upload Files to Reconcile" :
               sourceType === "database_database" ? "Select Databases to Reconcile" :
               "Select Sources to Reconcile"}
            </h3>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              {sourceTypeLabel}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {sourceType === "document_document" ? (
              <>Upload both reports and AI will automatically detect the columns and data types.
              Source A is your source of truth — unmatched Source A rows will appear in the &ldquo;Not Matched&rdquo; tab.</>
            ) : sourceType === "database_database" ? (
              <>Select the two databases to reconcile. AI will map columns automatically.
              Source A is your source of truth.</>
            ) : (
              <>Select a database for Source A and upload a file for Source B.
              Source A is your source of truth.</>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Source A */}
          {sourceAIsDatabase ? (
            <DatabaseSourcePicker
              side="A"
              sideLabel="Source of Truth"
              sideDescription="e.g. ERP, General Ledger, AP report"
              onAnalyzed={handleDbAnalyzedA}
              selectedDatabaseId={dbAnalysisA?.databaseId}
            />
          ) : (
            <DropZone side="A" analysis={sourceA} analyzing={analyzingA} />
          )}

          {/* Source B */}
          {sourceBIsDatabase ? (
            <DatabaseSourcePicker
              side="B"
              sideLabel="Comparison"
              sideDescription="e.g. Bank statement, card feed"
              onAnalyzed={handleDbAnalyzedB}
              selectedDatabaseId={dbAnalysisB?.databaseId}
            />
          ) : (
            <DropZone side="B" analysis={sourceB} analyzing={analyzingB} />
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setStep("source_type")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Change source type
          </button>

          {sourceAReady && sourceBReady && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <span>
                  {getSourceAColumns().length} + {getSourceBColumns().length} columns detected
                </span>
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
      </div>
    )
  }

  // ── Render: Step 2 - Column Mapping ───────────────────────────────

  if (step === "map") {
    const colsA = getSourceAColumns()
    const colsB = getSourceBColumns()

    return (
      <div className="max-w-4xl space-y-6">
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

        {/* Matching Fields */}
        <div>
          <div className="mb-3">
            <h4 className="text-sm font-medium text-gray-700">Matching Fields</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Each row pairs a column from {sourceALabel || "Source A"} with one from {sourceBLabel || "Source B"}. Only these fields are used to match transactions.
            </p>
          </div>

          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[1fr_32px_1fr_100px_120px_32px] gap-2 items-center px-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{sourceALabel}</span>
              <span />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{sourceBLabel}</span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Period ID</span>
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
                    value={mapping.sourceAKey}
                    onValueChange={(v) => {
                      const updated = [...mappings]
                      const col = colsA.find((c) => c.key === v)
                      updated[i] = { ...updated[i], sourceAKey: v, label: col?.label || v }
                      setMappings(updated)
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {colsA.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label}
                          {col.sampleValues[0] && (
                            <span className="ml-1 text-gray-400">({col.sampleValues[0]})</span>
                          )}
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
                  <Select value={mapping.sourceBKey} onValueChange={(v) => updateMappingBKey(i, v)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {colsB.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label}
                          {col.sampleValues[0] && (
                            <span className="ml-1 text-gray-400">({col.sampleValues[0]})</span>
                          )}
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

                {/* Period Identifier — only for date columns */}
                <div>
                  {mapping.type === "date" ? (
                    <Select
                      value={mapping.isPeriodIdentifier ? "yes" : "no"}
                      onValueChange={(v) => updatePeriodIdentifier(i, v === "yes")}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-gray-400 px-1">&mdash;</span>
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

            {/* Add mapping button — always visible as long as there are unused columns */}
            {colsA.length > 0 && colsB.length > 0 && (
              <button
                onClick={addMapping}
                disabled={
                  colsA.filter(
                    (c) => !mappings.some((m) => m.sourceAKey === c.key)
                  ).length === 0 ||
                  colsB.filter(
                    (c) => !mappings.some((m) => m.sourceBKey === c.key)
                  ).length === 0
                }
                className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 px-2 py-1 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                + Add matching field
              </button>
            )}
          </div>
        </div>

        {/* Summary of unmapped columns — informational only */}
        {(() => {
          const unusedA = colsA.filter(
            (c) => !mappings.some((m) => m.sourceAKey === c.key)
          )
          const unusedB = colsB.filter(
            (c) => !mappings.some((m) => m.sourceBKey === c.key)
          )
          if (unusedA.length === 0 && unusedB.length === 0) return null
          return (
            <p className="text-xs text-gray-400">
              {unusedA.length + unusedB.length} column{unusedA.length + unusedB.length !== 1 ? "s" : ""} not used for matching — they&apos;ll still appear in your data but won&apos;t affect match results.
            </p>
          )
        })()}

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
            &larr; Back to sources
          </button>
          <Button
            onClick={handleCreate}
            disabled={creating || mappings.length === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white min-w-[180px]"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reconciling...
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
