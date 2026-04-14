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
  FileSpreadsheet,
} from "lucide-react"
import { DatabaseSourcePicker, type DatabaseAnalysis } from "./database-source-picker"

// ── Types ──────────────────────────────────────────────────────────────

type SourceFormat = "pdf" | "excel" | "database"
type SourceType = `${SourceFormat}_${SourceFormat}`

type SideMeta = { kind: "file" | "database"; accept?: string; formatLabel?: string; format: SourceFormat }

const FORMAT_META: Record<SourceFormat, SideMeta> = {
  pdf: { kind: "file", accept: ".pdf", formatLabel: "PDF", format: "pdf" },
  excel: { kind: "file", accept: ".csv,.xlsx,.xls", formatLabel: "Excel or CSV", format: "excel" },
  database: { kind: "database", format: "database" },
}

const SOURCE_TYPE_META: Record<SourceType, { sideA: SideMeta; sideB: SideMeta }> = {
  pdf_pdf: { sideA: FORMAT_META.pdf, sideB: FORMAT_META.pdf },
  pdf_excel: { sideA: FORMAT_META.pdf, sideB: FORMAT_META.excel },
  pdf_database: { sideA: FORMAT_META.pdf, sideB: FORMAT_META.database },
  excel_pdf: { sideA: FORMAT_META.excel, sideB: FORMAT_META.pdf },
  excel_excel: { sideA: FORMAT_META.excel, sideB: FORMAT_META.excel },
  excel_database: { sideA: FORMAT_META.excel, sideB: FORMAT_META.database },
  database_pdf: { sideA: FORMAT_META.database, sideB: FORMAT_META.pdf },
  database_excel: { sideA: FORMAT_META.database, sideB: FORMAT_META.excel },
  database_database: { sideA: FORMAT_META.database, sideB: FORMAT_META.database },
}

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
  rows?: Record<string, any>[] // pre-parsed rows (Excel/CSV have all rows, PDF has placeholders)
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
  const [step, setStep] = useState<"source_type" | "upload" | "review" | "map" | "confirm">("source_type")

  // Source type selection
  const [sourceType, setSourceType] = useState<SourceType>("excel_pdf")

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

  // Extraction hints (for AI training when detection fails)
  const [sourceAHints, setSourceAHints] = useState("")
  const [sourceBHints, setSourceBHints] = useState("")
  const [retryingA, setRetryingA] = useState(false)
  const [retryingB, setRetryingB] = useState(false)

  // State
  const [creating, setCreating] = useState(false)
  const [creatingStatus, setCreatingStatus] = useState("")
  const [error, setError] = useState("")
  const [matchingGuidelines, setMatchingGuidelines] = useState("")

  // ── Source type helpers ──────────────────────────────────────────────

  const sourceAIsDatabase = SOURCE_TYPE_META[sourceType].sideA.kind === "database"
  const sourceBIsDatabase = SOURCE_TYPE_META[sourceType].sideB.kind === "database"

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
        rows: data.rows, // Excel/CSV: all rows. PDF: undefined (placeholders only)
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

  const generateMappings = useCallback(async () => {
    const colsA = getSourceAColumns()
    const colsB = getSourceBColumns()
    if (colsA.length === 0 || colsB.length === 0) return

    // Step 1: Try heuristic label matching
    const newMappings: ColumnMapping[] = []
    const usedB = new Set<string>()

    for (const colA of colsA) {
      let bestMatch: DetectedColumn | null = null
      let bestScore = 0
      let bestLabelScore = 0

      for (const colB of colsB) {
        if (usedB.has(colB.key)) continue

        let labelScore = 0
        if (colA.label === colB.label) labelScore = 100
        else if (colA.label.toLowerCase() === colB.label.toLowerCase()) labelScore = 80
        else if (
          colA.label.toLowerCase().includes(colB.label.toLowerCase()) ||
          colB.label.toLowerCase().includes(colA.label.toLowerCase())
        ) labelScore = 50

        let typeBonus = 0
        if (colA.suggestedType === colB.suggestedType) {
          typeBonus = (colA.suggestedType === "date" || colA.suggestedType === "amount") ? 30 : 15
        }

        const score = labelScore + typeBonus
        if (score > bestScore) {
          bestScore = score
          bestLabelScore = labelScore
          bestMatch = colB
        }
      }

      if (bestMatch && bestLabelScore >= 50) {
        usedB.add(bestMatch.key)
        newMappings.push({
          sourceAKey: colA.key,
          sourceBKey: bestMatch.key,
          type: colA.suggestedType,
          label: colA.label,
        })
      }
    }

    // Step 2: If heuristic found few/no mappings, use AI suggest-mappings
    if (newMappings.length < 2) {
      try {
        setError("")
        const res = await fetch("/api/reconciliations/suggest-mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceA: { label: sourceALabel, columns: colsA },
            sourceB: { label: sourceBLabel, columns: colsB },
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const aiMappings: ColumnMapping[] = (data.mappings || [])
            .filter((m: any) => m.sourceAKey && m.sourceBKey)
            .map((m: any) => ({
              sourceAKey: m.sourceAKey,
              sourceBKey: m.sourceBKey,
              type: m.type || "text",
              label: m.label || colsA.find((c) => c.key === m.sourceAKey)?.label || m.sourceAKey,
            }))
          if (aiMappings.length > 0) {
            setMappings(aiMappings)
            setStep("map")
            return
          }
        }
      } catch {
        // AI mapping failed, fall through to heuristic results
      }
    }

    setMappings(newMappings)
    setStep("map")
  }, [sourceA, sourceB, dbAnalysisA, dbAnalysisB, sourceType, sourceALabel, sourceBLabel]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const colB = getSourceBColumns().find((c) => c.key === newBKey)
    // Auto-update type to match the B column's detected type if it's more specific
    const newType = colB?.suggestedType && colB.suggestedType !== "text" ? colB.suggestedType : updated[index].type
    updated[index] = { ...updated[index], sourceBKey: newBKey, type: newType }
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

  // ── Save Configuration ──────────────────────────────────────────────

  const handleCreate = async () => {
    if (!sourceAReady || !sourceBReady || mappings.length === 0) return
    setCreating(true)
    setError("")

    try {
      // Build source configs from mappings
      const colsA = getSourceAColumns()
      const sourceAConfig: Record<string, any> = {
        label: sourceALabel,
        columns: mappings.map((m) => {
          const detectedCol = colsA.find((c) => c.key === m.sourceAKey)
          return {
            key: m.sourceAKey,
            label: m.label,
            type: m.type,
            ...(detectedCol?.sampleValues && { sampleValues: detectedCol.sampleValues }),
          }
        }),
      }
      const colsB = getSourceBColumns()
      const sourceBConfig: Record<string, any> = {
        label: sourceBLabel,
        columns: mappings.map((m) => {
          const detectedCol = colsB.find((c) => c.key === m.sourceBKey)
          return {
            key: m.sourceBKey,
            label: m.label,
            type: m.type,
            // Include sample values so generate-test can use them as few-shot examples
            ...(detectedCol?.sampleValues && { sampleValues: detectedCol.sampleValues }),
          }
        }),
      }

      // Add database metadata to source configs if applicable
      // Period identifier: find the mapping marked as period identifier
      const periodMapping = mappings.find((m) => m.isPeriodIdentifier)
      const [fmtA, fmtB] = sourceType.split("_") as [SourceFormat, SourceFormat]

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

      // Save extraction profiles with hints if provided
      if (sourceAHints.trim()) {
        sourceAConfig.extractionProfile = {
          extractionHints: sourceAHints.trim(),
          sourceFormat: fmtA,
          lastUpdated: new Date().toISOString(),
        }
      }
      if (sourceBHints.trim()) {
        sourceBConfig.extractionProfile = {
          extractionHints: sourceBHints.trim(),
          sourceFormat: fmtB,
          lastUpdated: new Date().toISOString(),
        }
      }

      // Create the config only — test run is triggered separately from the config page
      const configRes = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceType,
          sourceAConfig,
          sourceBConfig,
          matchingRules: {
            amountMatch: "tolerance",
            amountTolerance: 0.01,
            dateWindowDays: 3,
            fuzzyDescription: true,
          },
          ...(matchingGuidelines.trim() && { matchingGuidelines: matchingGuidelines.trim() }),
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
    const formatIcon = (format: SourceFormat) => {
      if (format === "pdf") return <FileText className="w-5 h-5" />
      if (format === "excel") return <FileSpreadsheet className="w-5 h-5" />
      return <Database className="w-5 h-5" />
    }

    const formatName = (format: SourceFormat) => {
      if (format === "pdf") return "PDF"
      if (format === "excel") return "Excel"
      return "Database"
    }

    const SOURCE_TYPE_OPTIONS: { value: SourceType; title: string; description: string; icon: React.ReactNode }[] = [
      {
        value: "excel_pdf",
        title: "Excel vs PDF",
        description: "Reconcile an Excel/CSV export against a PDF statement (e.g. AP report vs credit card statement)",
        icon: <div className="flex items-center gap-1">{formatIcon("excel")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("pdf")}</div>,
      },
      {
        value: "excel_excel",
        title: "Excel vs Excel",
        description: "Reconcile two Excel or CSV files",
        icon: <div className="flex items-center gap-1">{formatIcon("excel")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("excel")}</div>,
      },
      {
        value: "pdf_pdf",
        title: "PDF vs PDF",
        description: "Reconcile two PDF documents (e.g. two bank statements)",
        icon: <div className="flex items-center gap-1">{formatIcon("pdf")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("pdf")}</div>,
      },
      {
        value: "pdf_excel",
        title: "PDF vs Excel",
        description: "Reconcile a PDF document against an Excel/CSV file",
        icon: <div className="flex items-center gap-1">{formatIcon("pdf")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("excel")}</div>,
      },
      {
        value: "excel_database",
        title: "Excel vs Database",
        description: "Reconcile an Excel/CSV file against a connected database",
        icon: <div className="flex items-center gap-1">{formatIcon("excel")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("database")}</div>,
      },
      {
        value: "pdf_database",
        title: "PDF vs Database",
        description: "Reconcile a PDF document against a connected database",
        icon: <div className="flex items-center gap-1">{formatIcon("pdf")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("database")}</div>,
      },
      {
        value: "database_excel",
        title: "Database vs Excel",
        description: "Reconcile a connected database against an Excel/CSV file",
        icon: <div className="flex items-center gap-1">{formatIcon("database")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("excel")}</div>,
      },
      {
        value: "database_pdf",
        title: "Database vs PDF",
        description: "Reconcile a connected database against a PDF document",
        icon: <div className="flex items-center gap-1">{formatIcon("database")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("pdf")}</div>,
      },
      {
        value: "database_database",
        title: "Database vs Database",
        description: "Reconcile two connected databases — required for AI agent automation",
        icon: <div className="flex items-center gap-1">{formatIcon("database")}<span className="text-gray-300 text-xs">&times;</span>{formatIcon("database")}</div>,
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
                setSourceAHints("")
                setSourceBHints("")
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
    const meta = side === "A" ? SOURCE_TYPE_META[sourceType].sideA : SOURCE_TYPE_META[sourceType].sideB
    const acceptStr = meta.accept || ".csv,.xlsx,.xls,.pdf"
    const formatLabel = meta.formatLabel || "CSV, Excel, or PDF"

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
            <input type="file" accept={acceptStr} className="hidden" onChange={handleFileSelect} />
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
            <p className="text-[10px] text-gray-300 mt-0.5">Drop {formatLabel}</p>
            <label className="mt-3 inline-block">
              <span className="text-xs text-orange-500 hover:text-orange-600 cursor-pointer underline">
                Browse files
              </span>
              <input type="file" accept={acceptStr} className="hidden" onChange={handleFileSelect} />
            </label>
          </>
        )}
      </div>
    )
  }

  if (step === "upload") {
    const [formatA, formatB] = sourceType.split("_") as [SourceFormat, SourceFormat]
    const fmtName = (f: SourceFormat) => f === "pdf" ? "PDF" : f === "excel" ? "Excel" : "Database"
    const sourceTypeLabel = `${fmtName(formatA)} vs ${fmtName(formatB)}`

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-gray-900">
              {sourceAIsDatabase && sourceBIsDatabase
                ? "Select Databases to Reconcile"
                : sourceAIsDatabase || sourceBIsDatabase
                ? "Select Sources to Reconcile"
                : "Upload Files to Reconcile"}
            </h3>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              {sourceTypeLabel}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {sourceAIsDatabase && sourceBIsDatabase ? (
              <>Select the two databases to reconcile. AI will map columns automatically.
              Source A is your source of truth.</>
            ) : sourceAIsDatabase && !sourceBIsDatabase ? (
              <>Select a database for Source A and upload a file for Source B.
              Source A is your source of truth.</>
            ) : !sourceAIsDatabase && sourceBIsDatabase ? (
              <>Upload a file for Source A and select a database for Source B.
              Source A is your source of truth.</>
            ) : (
              <>Upload both reports and AI will automatically detect the columns and data types.
              Source A is your source of truth — unmatched Source A rows will appear in the &ldquo;Not Matched&rdquo; tab.</>
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
                onClick={() => setStep("review")}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                Review Extraction <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Render: Step 1.5 - Review Extraction ──────────────────────────

  if (step === "review") {
    const retryWithHints = async (side: "A" | "B") => {
      const analysis = side === "A" ? sourceA : sourceB
      if (!analysis) return

      const setter = side === "A" ? setRetryingA : setRetryingB
      const resultSetter = side === "A" ? setSourceA : setSourceB
      const hints = side === "A" ? sourceAHints : sourceBHints

      setter(true)
      setError("")

      try {
        const formData = new FormData()
        formData.append("file", analysis.file)
        if (hints) formData.append("extractionHints", hints)

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
          file: analysis.file,
        })
      } catch (err: any) {
        setError(err.message)
      } finally {
        setter(false)
      }
    }

    const renderSourceReview = (side: "A" | "B", analysis: FileAnalysis | null, dbAnalysis: DatabaseAnalysis | null) => {
      const isDb = side === "A" ? sourceAIsDatabase : sourceBIsDatabase
      const hints = side === "A" ? sourceAHints : sourceBHints
      const setHints = side === "A" ? setSourceAHints : setSourceBHints
      const retrying = side === "A" ? retryingA : retryingB

      if (isDb && dbAnalysis) {
        return (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">{dbAnalysis.databaseName}</span>
            </div>
            <p className="text-xs text-green-600">{dbAnalysis.rowCount} rows &middot; {dbAnalysis.columns.length} columns</p>
          </div>
        )
      }

      if (!analysis) return null
      const failed = analysis.columns.length === 0

      return (
        <div className={`border rounded-lg p-4 ${failed ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"}`}>
          <div className="flex items-center gap-2 mb-1">
            {failed ? (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
            <span className={`text-sm font-medium ${failed ? "text-amber-800" : "text-green-800"}`}>
              {analysis.fileName}
            </span>
          </div>

          {failed ? (
            <>
              <p className="text-xs text-amber-700 mb-3">
                AI couldn&apos;t detect tables in this document. Provide hints below to help.
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-gray-600">Extraction hints for AI</Label>
                  <textarea
                    value={hints}
                    onChange={(e) => setHints(e.target.value)}
                    placeholder={"Help the AI find the right data. Examples:\n\u2022 Transactions start on page 2 in Purchasing Activity and Travel Activity sections\n\u2022 Each cardholder has their own section with separate tables\n\u2022 Ignore the summary section on page 1"}
                    className="w-full h-20 mt-1 text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 placeholder:text-gray-300"
                  />
                </div>
                <Button
                  onClick={() => retryWithHints(side)}
                  disabled={retrying || !hints.trim()}
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
                >
                  {retrying ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Re-analyzing...</>
                  ) : (
                    <><Sparkles className="w-3 h-3 mr-1" /> Retry with AI hints</>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-green-600 mb-2">
                {analysis.rowCount} rows &middot; {analysis.columns.length} columns detected
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr>
                      {analysis.columns.slice(0, 6).map((col) => (
                        <th key={col.key} className="text-left px-1.5 py-1 bg-green-100 text-green-700 font-medium border-b border-green-200">
                          {col.label}
                          <span className="ml-1 text-green-500">({col.suggestedType})</span>
                        </th>
                      ))}
                      {analysis.columns.length > 6 && (
                        <th className="px-1.5 py-1 bg-green-100 text-green-500 border-b border-green-200">
                          +{analysis.columns.length - 6} more
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2].map((rowIdx) => (
                      <tr key={rowIdx}>
                        {analysis.columns.slice(0, 6).map((col) => (
                          <td key={col.key} className="px-1.5 py-0.5 text-gray-600 border-b border-green-100 truncate max-w-[120px]">
                            {col.sampleValues[rowIdx] || "\u2014"}
                          </td>
                        ))}
                        {analysis.columns.length > 6 && <td className="px-1.5 py-0.5 text-gray-400 border-b border-green-100">...</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )
    }

    const anyFailed = (!sourceAIsDatabase && sourceA && sourceA.columns.length === 0) ||
                       (!sourceBIsDatabase && sourceB && sourceB.columns.length === 0)

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Review Extraction</h3>
          <p className="text-sm text-gray-500">
            Verify what AI detected from your files.
            {anyFailed && " For documents that failed detection, provide hints to help the AI."}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Source A — Source of Truth</h4>
            {renderSourceReview("A", sourceA, dbAnalysisA)}
          </div>
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Source B — Comparison</h4>
            {renderSourceReview("B", sourceB, dbAnalysisB)}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setStep("upload")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to upload
          </button>
          <Button
            onClick={generateMappings}
            disabled={anyFailed}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {anyFailed ? "Fix detection above first" : "Map Columns"} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
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

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_100px_32px] bg-gray-50 border-b border-gray-200 px-3 py-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{sourceALabel || "Source A"}</span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{sourceBLabel || "Source B"}</span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</span>
              <span />
            </div>

            {mappings.map((mapping, i) => {
              const colA = colsA.find((c) => c.key === mapping.sourceAKey)
              const colB = colsB.find((c) => c.key === mapping.sourceBKey)

              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_100px_32px] items-center px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
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
                      <SelectTrigger className="h-8 text-xs border-gray-200">
                        <SelectValue>{colA?.label || mapping.sourceAKey}</SelectValue>
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

                  {/* Source B column */}
                  <div>
                    <Select value={mapping.sourceBKey} onValueChange={(v) => updateMappingBKey(i, v)}>
                      <SelectTrigger className="h-8 text-xs border-gray-200">
                        <SelectValue>{colB?.label || mapping.sourceBKey}</SelectValue>
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
                    <SelectTrigger className="h-8 text-xs border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="amount">Amount</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="reference">Reference</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Remove */}
                  <button
                    onClick={() => removeMapping(i)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors justify-self-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}

            {/* Add mapping button */}
            {colsA.length > 0 && colsB.length > 0 && (
              <div className="px-3 py-2 border-t border-gray-100">
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
                  className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  + Add matching field
                </button>
              </div>
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

        {/* AI Matching Guidelines */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              AI Matching Instructions
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            {matchingGuidelines.length > 0 && (
              <span className="text-xs text-gray-400">{matchingGuidelines.length}/2000</span>
            )}
          </div>
          <textarea
            value={matchingGuidelines}
            onChange={(e) => setMatchingGuidelines(e.target.value.slice(0, 2000))}
            placeholder={"Guide the AI on how to match these specific sources. Examples:\n• Match on cardholder initials, amount, and date — reference numbers are unrelated\n• Credits in Source A are type 'C' with negative amounts\n• The 2-letter code at position 9-10 of the invoice number maps to cardholder initials"}
            className="w-full h-24 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 placeholder:text-gray-300"
          />
          <p className="text-xs text-gray-400">
            These instructions persist across runs and improve matching accuracy over time.
          </p>
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
            onClick={() => setStep("review")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to review
          </button>
          <Button
            onClick={handleCreate}
            disabled={creating || mappings.length === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white min-w-[180px]"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Save Reconciliation <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
