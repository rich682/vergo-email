"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  FileSpreadsheet, 
  FileText,
  FileImage,
  Play, 
  Loader2, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Columns,
  Key,
  Sparkles,
  Anchor,
  Files,
  Target,
  Lightbulb,
  ListChecks,
  Gauge,
  CalendarDays,
  DollarSign
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ColumnMapping {
  doc1Column: string
  doc2Column: string
  confidence: number
  matchType: "exact" | "fuzzy" | "ai_suggested"
}

interface Discrepancy {
  type: "missing_in_doc1" | "missing_in_doc2" | "value_mismatch"
  keyColumn: string
  keyValue: string
  details: string
}

interface SupportingDocument {
  name: string
  url: string
  size: number
  uploadOrder: number
  mimeType?: string
}

interface ExtractedTotal {
  label?: string
  value: number
  currency?: string
  confidence: "high" | "medium" | "low"
}

interface ExtractedDate {
  label?: string
  date: string
  type?: string
}

interface V1Output {
  confidenceScore: number
  confidenceLabel: "High" | "Medium" | "Low"
  keyFindings: string[]
  suggestedNextSteps: string[]
}

interface ReconciliationIntent {
  type: "ROW_LEVEL" | "TOTALS_ONLY" | "AGGREGATED_TO_DETAIL" | "HYBRID" | "UNKNOWN"
  confidence: number
  anchorRoleExplanation: string
  supportingRoleExplanation: string
  userDescription?: string
}

interface SupportingDocumentResult {
  documentName: string
  matchedCount: number
  unmatchedCount: number
  rowCount: number
}

interface Reconciliation {
  id: string
  document1Name: string
  document2Name: string
  document1MimeType?: string
  document2MimeType?: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  summary?: string | null
  matchedCount?: number | null
  unmatchedCount?: number | null
  totalRows?: number | null
  discrepancies?: Discrepancy[] | null
  columnMappings?: ColumnMapping[] | null
  keyColumn?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt?: string
  createdBy?: {
    name?: string
    email?: string
  }
  // V1: Enhanced output fields
  confidenceScore?: number | null
  keyFindings?: string[] | null
  suggestedNextSteps?: string[] | null
  anchorRole?: string | null
  templateId?: string | null
  // Anchored reconciliation fields
  isAnchored?: boolean
  anchorDocument?: { name: string; url?: string; size?: number; mimeType?: string }
  allSupportingDocuments?: SupportingDocument[]
  supportingDocuments?: SupportingDocument[]
  v1Output?: V1Output | null
  result?: {
    reconciliationIntent?: ReconciliationIntent
    supportingResults?: SupportingDocumentResult[]
    anchor?: { name: string; rowCount: number }
    // V1: Summary info with extracted signals
    anchorSummary?: {
      role: string
      filename: string
      fileType: "structured" | "pdf" | "image"
      extractedTotals?: ExtractedTotal[]
      extractedDates?: ExtractedDate[]
      rowCount?: number
    }
    supportingSummaries?: Array<{
      role: string
      filename: string
      fileType: "structured" | "pdf" | "image"
      extractedTotals?: ExtractedTotal[]
      extractedDates?: ExtractedDate[]
      rowCount?: number
    }>
  }
}

interface ReconciliationResultCardProps {
  reconciliation: Reconciliation
  jobId: string
  onUpdate?: (updated: Reconciliation) => void
}

// Expandable discrepancy row component
function DiscrepancyRow({ discrepancy, isAnchored }: { discrepancy: Discrepancy; isAnchored?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLongDetails = discrepancy.details.length > 80

  // Use anchor-centric labels
  const getTypeLabel = () => {
    if (isAnchored) {
      if (discrepancy.type === "missing_in_doc1") return "Missing in Supporting"
      if (discrepancy.type === "missing_in_doc2") return "Missing in Anchor"
      return "Value Mismatch"
    }
    // Legacy labels
    if (discrepancy.type === "missing_in_doc1") return "Missing Doc 1"
    if (discrepancy.type === "missing_in_doc2") return "Missing Doc 2"
    return "Mismatch"
  }

  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          discrepancy.type === "missing_in_doc1" 
            ? "bg-orange-100 text-orange-700" 
            : discrepancy.type === "missing_in_doc2"
            ? "bg-purple-100 text-purple-700"
            : "bg-red-100 text-red-700"
        }`}>
          {getTypeLabel()}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded break-all">
          {discrepancy.keyValue}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">
        {isLongDetails ? (
          <>
            <span className={isExpanded ? "" : "line-clamp-2"}>
              {discrepancy.details}
            </span>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 hover:text-blue-700 text-xs mt-1 block"
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          </>
        ) : (
          discrepancy.details
        )}
      </td>
    </tr>
  )
}

// File type icon helper
function getFileIcon(mimeType?: string, size: "sm" | "lg" = "sm") {
  const sizeClass = size === "lg" ? "w-8 h-8" : "w-4 h-4"
  
  if (mimeType?.includes("pdf")) {
    return <FileText className={`${sizeClass} text-red-600`} />
  }
  if (mimeType?.startsWith("image/")) {
    return <FileImage className={`${sizeClass} text-purple-600`} />
  }
  return <FileSpreadsheet className={`${sizeClass} text-green-600`} />
}

// Intent badge component
function IntentBadge({ intent }: { intent: ReconciliationIntent }) {
  const intentLabels: Record<string, string> = {
    ROW_LEVEL: "Row-Level",
    TOTALS_ONLY: "Totals Only",
    AGGREGATED_TO_DETAIL: "Aggregated",
    HYBRID: "Hybrid",
    UNKNOWN: "Unknown"
  }

  const intentColors: Record<string, string> = {
    ROW_LEVEL: "bg-blue-100 text-blue-700",
    TOTALS_ONLY: "bg-purple-100 text-purple-700",
    AGGREGATED_TO_DETAIL: "bg-orange-100 text-orange-700",
    HYBRID: "bg-cyan-100 text-cyan-700",
    UNKNOWN: "bg-gray-100 text-gray-700"
  }

  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${intentColors[intent.type] || intentColors.UNKNOWN}`}
      title={intent.anchorRoleExplanation}
    >
      <Target className="w-3 h-3" />
      {intentLabels[intent.type] || "Unknown"}
    </span>
  )
}

// V1: Confidence badge component
function ConfidenceBadge({ score, label }: { score: number; label?: "High" | "Medium" | "Low" }) {
  const resolvedLabel = label || (score >= 80 ? "High" : score >= 50 ? "Medium" : "Low")
  
  const colors = {
    High: "bg-green-100 text-green-700 border-green-200",
    Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Low: "bg-orange-100 text-orange-700 border-orange-200"
  }

  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colors[resolvedLabel]}`}
      title={`AI confidence: ${score}%`}
    >
      <Gauge className="w-3 h-3" />
      {score}% Confidence
    </span>
  )
}

// V1: Key Findings component
function KeyFindingsSection({ findings }: { findings: string[] }) {
  if (!findings || findings.length === 0) return null

  return (
    <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <span className="text-sm font-medium text-green-800">Key Findings</span>
          <ul className="mt-1 space-y-0.5">
            {findings.map((finding, i) => (
              <li key={i} className="text-sm text-green-700 flex items-start gap-1.5">
                <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// V1: Next Steps component
function NextStepsSection({ steps }: { steps: string[] }) {
  if (!steps || steps.length === 0) return null

  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
      <div className="flex items-start gap-2">
        <ListChecks className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <span className="text-sm font-medium text-blue-800">Suggested Next Steps</span>
          <ul className="mt-1 space-y-0.5">
            {steps.map((step, i) => (
              <li key={i} className="text-sm text-blue-700 flex items-start gap-1.5">
                <span className="text-blue-400">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// V1: Extracted signals component (for PDF/images)
function ExtractedSignalsSection({ 
  totals, 
  dates 
}: { 
  totals?: ExtractedTotal[]; 
  dates?: ExtractedDate[] 
}) {
  if ((!totals || totals.length === 0) && (!dates || dates.length === 0)) return null

  return (
    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <span className="text-xs font-medium text-gray-700">Extracted Signals</span>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {totals && totals.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <DollarSign className="w-3 h-3" />
              Totals
            </div>
            <ul className="space-y-0.5">
              {totals.slice(0, 3).map((t, i) => (
                <li key={i} className="text-xs text-gray-700">
                  <span className="font-medium">{t.label || "Total"}:</span>{" "}
                  {t.currency || "$"}{t.value.toLocaleString()}
                  <span className={`ml-1 text-xs ${
                    t.confidence === "high" ? "text-green-600" : 
                    t.confidence === "medium" ? "text-yellow-600" : "text-orange-600"
                  }`}>
                    ({t.confidence})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dates && dates.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <CalendarDays className="w-3 h-3" />
              Dates
            </div>
            <ul className="space-y-0.5">
              {dates.slice(0, 3).map((d, i) => (
                <li key={i} className="text-xs text-gray-700">
                  <span className="font-medium">{d.label || "Date"}:</span> {d.date}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function ReconciliationResultCard({
  reconciliation,
  jobId,
  onUpdate
}: ReconciliationResultCardProps) {
  const [processing, setProcessing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showColumnMappings, setShowColumnMappings] = useState(false)
  const [showSupportingDetails, setShowSupportingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // V1: Template saving state
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)

  // Determine if this is an anchored reconciliation
  const isAnchored = reconciliation.isAnchored || 
    Boolean(reconciliation.anchorDocument) || 
    Boolean(reconciliation.allSupportingDocuments?.length)

  // Get anchor and supporting info
  const anchorName = reconciliation.anchorDocument?.name || reconciliation.document1Name
  const supportingDocs = reconciliation.allSupportingDocuments || [
    { name: reconciliation.document2Name, url: "", size: 0, uploadOrder: 1 }
  ]

  // Get intent if available
  const intent = reconciliation.result?.reconciliationIntent

  // Get per-supporting results if available
  const supportingResults = reconciliation.result?.supportingResults || []

  // V1: Get confidence and findings
  const v1 = reconciliation.v1Output || {
    confidenceScore: reconciliation.confidenceScore || null,
    confidenceLabel: reconciliation.confidenceScore ? 
      (reconciliation.confidenceScore >= 80 ? "High" : reconciliation.confidenceScore >= 50 ? "Medium" : "Low") as "High" | "Medium" | "Low" : 
      null,
    keyFindings: reconciliation.keyFindings || null,
    suggestedNextSteps: reconciliation.suggestedNextSteps || null
  }

  // V1: Get anchor/supporting summaries with extracted signals
  const anchorSummary = reconciliation.result?.anchorSummary
  const supportingSummaries = reconciliation.result?.supportingSummaries || []

  const handleProcess = async () => {
    setProcessing(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${jobId}/reconciliations/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reconciliationId: reconciliation.id }),
          credentials: "include"
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Processing failed")
      }

      const data = await response.json()
      
      // Update local state with results
      onUpdate?.({
        ...reconciliation,
        status: "COMPLETED",
        summary: data.summary,
        matchedCount: data.matchedCount,
        unmatchedCount: data.unmatchedCount,
        totalRows: data.totalRows,
        discrepancies: data.discrepancies,
        columnMappings: data.columnMappings,
        keyColumn: data.keyColumn
      })

      setExpanded(true)
    } catch (err: any) {
      setError(err.message || "Failed to process reconciliation")
      onUpdate?.({
        ...reconciliation,
        status: "FAILED",
        errorMessage: err.message
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = () => {
    window.location.href = `/api/task-instances/${jobId}/reconciliations/${reconciliation.id}/export`
  }

  // V1: Save as recurring template
  const handleSaveAsTemplate = async () => {
    setSavingTemplate(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${jobId}/reconciliations/${reconciliation.id}/save-template`,
        {
          method: "POST",
          credentials: "include"
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save template")
      }

      setTemplateSaved(true)
    } catch (err: any) {
      setError(err.message || "Failed to save template")
    } finally {
      setSavingTemplate(false)
    }
  }

  const getStatusIcon = () => {
    switch (reconciliation.status) {
      case "PENDING":
        return <Clock className="w-4 h-4 text-amber-500" />
      case "PROCESSING":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case "COMPLETED":
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case "FAILED":
        return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const getStatusColor = () => {
    switch (reconciliation.status) {
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-200"
      case "PROCESSING":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "COMPLETED":
        return "bg-green-50 text-green-700 border-green-200"
      case "FAILED":
        return "bg-red-50 text-red-700 border-red-200"
    }
  }

  const matchRate = reconciliation.totalRows && reconciliation.matchedCount != null
    ? (((reconciliation.matchedCount ?? 0) / reconciliation.totalRows) * 100).toFixed(1)
    : null

  const discrepancies = reconciliation.discrepancies || []

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-green-600" />
            <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor()}`}>
                    {getStatusIcon()}
                    {reconciliation.status}
                  </span>
                  {intent && <IntentBadge intent={intent} />}
                  {v1.confidenceScore !== null && reconciliation.status === "COMPLETED" && (
                    <ConfidenceBadge score={v1.confidenceScore} label={v1.confidenceLabel || undefined} />
                  )}
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(reconciliation.createdAt), { addSuffix: true })}
                  </span>
                </div>
              
              {/* Document info with anchor/supporting distinction and file type icons */}
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-2 text-sm">
                  <Anchor className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-gray-600 flex items-center gap-1">
                    <span className="text-green-700 font-medium">Anchor:</span>
                    {getFileIcon(reconciliation.anchorDocument?.mimeType || reconciliation.document1MimeType)}
                    {anchorName}
                    {reconciliation.anchorRole && (
                      <span className="text-xs text-gray-400 ml-1">({reconciliation.anchorRole})</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Files className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-gray-600 flex items-center gap-1">
                    <span className="text-blue-700 font-medium">Supporting:</span>{" "}
                    {supportingDocs.length === 1 ? (
                      <>
                        {getFileIcon(supportingDocs[0].mimeType || reconciliation.document2MimeType)}
                        {supportingDocs[0].name}
                      </>
                    ) : (
                      `${supportingDocs.length} documents`
                    )}
                  </span>
                  {supportingDocs.length > 1 && (
                    <button
                      onClick={() => setShowSupportingDetails(!showSupportingDetails)}
                      className="text-blue-600 hover:text-blue-700 text-xs"
                    >
                      {showSupportingDetails ? "hide" : "show"}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Expandable supporting docs list */}
              {showSupportingDetails && supportingDocs.length > 1 && (
                <ul className="mt-1 ml-5 text-xs text-gray-500 space-y-0.5">
                  {supportingDocs.map((doc, i) => (
                    <li key={i}>• {doc.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {reconciliation.status === "PENDING" && (
              <Button
                size="sm"
                onClick={handleProcess}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Process
                  </>
                )}
              </Button>
            )}

            {reconciliation.status === "COMPLETED" && (
              <>
                {!templateSaved && !reconciliation.templateId && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleSaveAsTemplate}
                    disabled={savingTemplate}
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  >
                    {savingTemplate ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    Save Template
                  </Button>
                )}
                {(templateSaved || reconciliation.templateId) && (
                  <span className="text-xs text-purple-600 flex items-center gap-1 px-2">
                    <CheckCircle className="w-3 h-3" />
                    Template Saved
                  </span>
                )}
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </>
            )}

            {reconciliation.status === "FAILED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleProcess}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                Retry
              </Button>
            )}
          </div>
        </div>

        {/* Error message */}
        {(error || reconciliation.errorMessage) && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error || reconciliation.errorMessage}
          </div>
        )}

        {/* Intent explanation for completed reconciliations */}
        {reconciliation.status === "COMPLETED" && intent && intent.type !== "UNKNOWN" && (
          <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
            <div className="flex items-start gap-2">
              <Target className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-purple-800">
                <span className="font-medium">Reconciliation Type: {intent.type.replace("_", " ")}</span>
                <p className="mt-0.5 text-xs text-purple-600">{intent.anchorRoleExplanation}</p>
              </div>
            </div>
          </div>
        )}

        {/* Summary for completed reconciliations */}
        {reconciliation.status === "COMPLETED" && reconciliation.summary && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">{reconciliation.summary}</p>
          </div>
        )}

        {/* V1: Key Findings */}
        {reconciliation.status === "COMPLETED" && v1.keyFindings && v1.keyFindings.length > 0 && (
          <KeyFindingsSection findings={v1.keyFindings} />
        )}

        {/* V1: Suggested Next Steps */}
        {reconciliation.status === "COMPLETED" && v1.suggestedNextSteps && v1.suggestedNextSteps.length > 0 && (
          <NextStepsSection steps={v1.suggestedNextSteps} />
        )}

        {/* V1: Extracted signals from anchor (for PDF/images) */}
        {reconciliation.status === "COMPLETED" && anchorSummary && 
          (anchorSummary.fileType === "pdf" || anchorSummary.fileType === "image") && (
          <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-green-700 mb-2">
              <Anchor className="w-3 h-3" />
              <span className="font-medium">Anchor Document Signals</span>
            </div>
            <ExtractedSignalsSection 
              totals={anchorSummary.extractedTotals} 
              dates={anchorSummary.extractedDates}
            />
          </div>
        )}

        {/* V1: Extracted signals from supporting docs (for PDF/images) */}
        {reconciliation.status === "COMPLETED" && supportingSummaries.some(s => s.fileType === "pdf" || s.fileType === "image") && (
          <div className="mt-3 space-y-2">
            {supportingSummaries
              .filter(s => s.fileType === "pdf" || s.fileType === "image")
              .map((s, i) => (
                <div key={i} className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-blue-700 mb-2">
                    {getFileIcon(s.fileType === "pdf" ? "application/pdf" : "image/png")}
                    <span className="font-medium">{s.filename} Signals</span>
                    {s.role && <span className="text-blue-500">({s.role})</span>}
                  </div>
                  <ExtractedSignalsSection 
                    totals={s.extractedTotals} 
                    dates={s.extractedDates}
                  />
                </div>
              ))
            }
          </div>
        )}

        {/* Stats for completed reconciliations */}
        {reconciliation.status === "COMPLETED" && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            <div className="text-center p-2 bg-green-50 rounded">
              <div className="text-lg font-semibold text-green-700">
                {reconciliation.matchedCount ?? 0}
              </div>
              <div className="text-xs text-green-600">Matched</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded">
              <div className="text-lg font-semibold text-red-700">
                {reconciliation.unmatchedCount ?? 0}
              </div>
              <div className="text-xs text-red-600">Discrepancies</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-lg font-semibold text-gray-700">
                {reconciliation.totalRows ?? 0}
              </div>
              <div className="text-xs text-gray-600">Total Rows</div>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded">
              <div className="text-lg font-semibold text-blue-700">
                {matchRate ? `${matchRate}%` : "N/A"}
              </div>
              <div className="text-xs text-blue-600">Match Rate</div>
            </div>
          </div>
        )}

        {/* Per-supporting document stats (if multiple) */}
        {reconciliation.status === "COMPLETED" && supportingResults.length > 1 && (
          <div className="mt-3 border rounded-lg overflow-hidden">
            <div className="p-2 bg-blue-50 border-b">
              <h4 className="text-xs font-medium text-blue-700 flex items-center gap-1">
                <Files className="w-3.5 h-3.5" />
                Per-Document Results
              </h4>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-gray-500">Document</th>
                  <th className="px-3 py-1.5 text-right text-gray-500">Rows</th>
                  <th className="px-3 py-1.5 text-right text-gray-500">Matched</th>
                  <th className="px-3 py-1.5 text-right text-gray-500">Unmatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {supportingResults.map((sr, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{sr.documentName}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{sr.rowCount}</td>
                    <td className="px-3 py-1.5 text-right text-green-600">{sr.matchedCount}</td>
                    <td className="px-3 py-1.5 text-right text-red-600">{sr.unmatchedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Key Column indicator */}
        {reconciliation.status === "COMPLETED" && reconciliation.keyColumn && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <Key className="w-4 h-4 text-gray-400" />
            <span>Key Column: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{reconciliation.keyColumn}</span></span>
          </div>
        )}

        {/* Column Mappings toggle */}
        {reconciliation.status === "COMPLETED" && reconciliation.columnMappings && reconciliation.columnMappings.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowColumnMappings(!showColumnMappings)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <Columns className="w-4 h-4" />
              {showColumnMappings ? "Hide" : "Show"} Column Mappings ({reconciliation.columnMappings.length})
              {showColumnMappings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            
            {showColumnMappings && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        {isAnchored ? "Anchor Column" : "Document 1"}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        {isAnchored ? "Supporting Column" : "Document 2"}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Match Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reconciliation.columnMappings.map((mapping, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{mapping.doc1Column}</td>
                        <td className="px-3 py-2 font-mono text-xs">{mapping.doc2Column}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            mapping.matchType === "exact"
                              ? "bg-green-100 text-green-700"
                              : mapping.matchType === "fuzzy"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {mapping.matchType === "ai_suggested" && <Sparkles className="w-3 h-3" />}
                            {mapping.matchType === "exact" ? "Exact" : mapping.matchType === "fuzzy" ? "Fuzzy" : "AI Suggested"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium ${
                            mapping.confidence >= 0.9 ? "text-green-600" :
                            mapping.confidence >= 0.7 ? "text-yellow-600" :
                            "text-orange-600"
                          }`}>
                            {Math.round(mapping.confidence * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded discrepancies */}
      {expanded && reconciliation.status === "COMPLETED" && discrepancies.length > 0 && (
        <div className="border-t">
          <div className="p-3 bg-gray-50 border-b">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Discrepancies ({discrepancies.length})
            </h4>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-40">Key</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {discrepancies.slice(0, 50).map((d, i) => (
                  <DiscrepancyRow key={i} discrepancy={d} isAnchored={isAnchored} />
                ))}
              </tbody>
            </table>
            {discrepancies.length > 50 && (
              <div className="p-2 bg-gray-50 text-center text-xs text-gray-500">
                Showing first 50 of {discrepancies.length} discrepancies. Export to see all.
              </div>
            )}
          </div>
        </div>
      )}

      {expanded && reconciliation.status === "COMPLETED" && discrepancies.length === 0 && (
        <div className="border-t p-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No discrepancies found. Documents reconcile perfectly!</p>
        </div>
      )}
    </div>
  )
}
