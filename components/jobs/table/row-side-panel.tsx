"use client"

import { useState, useEffect, useCallback } from "react"
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
import {
  X,
  Paperclip,
  CheckCircle,
  AlertTriangle,
  Clock,
  Upload,
  Download,
  FileText,
  User,
  Calendar,
  Plus,
  Minus,
  RefreshCw,
  Trash2,
  ExternalLink,
  FileSpreadsheet,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { TableSchema, TableColumn } from "./schema-editor"
import { RowDeltaType, TableRowData } from "./table-row"

interface EvidenceItem {
  id: string
  filename: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  source: "EMAIL_REPLY" | "MANUAL_UPLOAD"
  submittedBy: string | null
  submittedByName: string | null
  receivedAt: string
  status: "UNREVIEWED" | "APPROVED" | "REJECTED"
}

interface ActivityLogEntry {
  id: string
  type: "import" | "edit" | "verify" | "evidence"
  timestamp: string
  userId?: string
  userName?: string
  description: string
  metadata?: any
}

interface RowSidePanelProps {
  open: boolean
  onClose: () => void
  taskInstanceId: string
  row: TableRowData | null
  schema: TableSchema | null
  isSnapshot?: boolean
  onVerificationChange?: (identityValue: any, status: string, notes?: string) => void
  onEvidenceLink?: (identityValue: any, evidenceId: string) => void
  onRefresh?: () => void
}

// Status badge component
function DeltaBadge({ type }: { type: RowDeltaType | undefined }) {
  switch (type) {
    case "ADDED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
          <Plus className="w-3 h-3" /> New
        </span>
      )
    case "CHANGED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
          <RefreshCw className="w-3 h-3" /> Changed
        </span>
      )
    case "REMOVED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
          <Minus className="w-3 h-3" /> Removed
        </span>
      )
    default:
      return null
  }
}

// Verification status options
const VERIFICATION_STATUSES = [
  { value: "UNVERIFIED", label: "Unverified", color: "bg-gray-100 text-gray-700", icon: Clock },
  { value: "VERIFIED", label: "Verified", color: "bg-green-100 text-green-700", icon: CheckCircle },
  { value: "FLAGGED", label: "Flagged", color: "bg-red-100 text-red-700", icon: AlertTriangle },
]

export function RowSidePanel({
  open,
  onClose,
  taskInstanceId,
  row,
  schema,
  isSnapshot,
  onVerificationChange,
  onEvidenceLink,
  onRefresh,
}: RowSidePanelProps) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [loadingEvidence, setLoadingEvidence] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<string>("UNVERIFIED")
  const [verificationNotes, setVerificationNotes] = useState("")
  const [savingVerification, setSavingVerification] = useState(false)

  // Get identity value
  const identityKey = schema?.identityKey || ""
  const identityValue = row ? row[identityKey] : null
  const identityColumn = schema?.columns.find(c => c.id === identityKey)

  // Fetch evidence linked to this row
  const fetchEvidence = useCallback(async () => {
    if (!taskInstanceId || !identityValue) return

    setLoadingEvidence(true)
    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/collection?rowIdentity=${encodeURIComponent(String(identityValue))}`,
        { credentials: "include" }
      )
      if (response.ok) {
        const data = await response.json()
        setEvidence(data.items || [])
      }
    } catch (error) {
      console.error("Error fetching evidence:", error)
    } finally {
      setLoadingEvidence(false)
    }
  }, [taskInstanceId, identityValue])

  // Initialize verification status from row data
  useEffect(() => {
    if (row) {
      // Look for a status column that might contain verification status
      const statusCol = schema?.columns.find(
        c => c.type === "status" && c.editPolicy === "EDITABLE_COLLAB"
      )
      if (statusCol && row[statusCol.id]) {
        setVerificationStatus(row[statusCol.id])
      } else {
        setVerificationStatus("UNVERIFIED")
      }

      // Look for a notes column
      const notesCol = schema?.columns.find(
        c => c.type === "notes" && c.editPolicy === "EDITABLE_COLLAB"
      )
      if (notesCol && row[notesCol.id]) {
        setVerificationNotes(row[notesCol.id])
      } else {
        setVerificationNotes("")
      }
    }
  }, [row, schema])

  // Fetch evidence when panel opens
  useEffect(() => {
    if (open && row) {
      fetchEvidence()
    }
  }, [open, row, fetchEvidence])

  // Handle verification status change
  const handleVerificationSave = async () => {
    if (!onVerificationChange || !identityValue) return

    setSavingVerification(true)
    try {
      await onVerificationChange(identityValue, verificationStatus, verificationNotes)
    } finally {
      setSavingVerification(false)
    }
  }

  if (!open || !row || !schema) return null

  // Get row data for display
  const displayColumns = schema.columns.filter(
    c => c.editPolicy !== "EDITABLE_COLLAB" || c.type !== "status"
  )

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-3 min-w-0">
          <FileSpreadsheet className="w-5 h-5 text-gray-400" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900 truncate">
                {identityColumn?.label}: {String(identityValue)}
              </h3>
              <DeltaBadge type={row._deltaType} />
            </div>
            <p className="text-xs text-gray-500">{schema.columns.length} columns</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Verification Section */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Verification
          </h4>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500">Status</Label>
              <Select
                value={verificationStatus}
                onValueChange={setVerificationStatus}
                disabled={isSnapshot}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERIFICATION_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      <div className="flex items-center gap-2">
                        <status.icon className="w-4 h-4" />
                        <span>{status.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-gray-500">Notes</Label>
              <Textarea
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="Add verification notes..."
                className="mt-1 text-sm"
                rows={3}
                disabled={isSnapshot}
              />
            </div>

            {!isSnapshot && (
              <Button
                size="sm"
                onClick={handleVerificationSave}
                disabled={savingVerification}
                className="w-full"
              >
                {savingVerification ? "Saving..." : "Save Verification"}
              </Button>
            )}
          </div>
        </section>

        {/* Evidence Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Evidence ({evidence.length})
            </h4>
            {!isSnapshot && (
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <Upload className="w-3 h-3 mr-1" />
                Link
              </Button>
            )}
          </div>

          {loadingEvidence ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
            </div>
          ) : evidence.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Paperclip className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No evidence linked to this row</p>
            </div>
          ) : (
            <div className="space-y-2">
              {evidence.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border"
                >
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.source === "EMAIL_REPLY" ? "Email" : "Upload"} •{" "}
                      {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        item.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : item.status === "REJECTED"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.fileUrl && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                        <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Row Data Section */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Row Data
          </h4>
          <div className="space-y-2">
            {displayColumns.map((column) => {
              const value = row[column.id]
              return (
                <div
                  key={column.id}
                  className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <span className="text-xs text-gray-500">{column.label}</span>
                  <span className="text-sm text-gray-900 text-right max-w-[60%] truncate">
                    {value !== null && value !== undefined ? String(value) : "—"}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Changes Section (if row has changes) */}
        {row._changes && Object.keys(row._changes).length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Changes from Prior Period
            </h4>
            <div className="space-y-2">
              {Object.entries(row._changes).map(([colId, change]) => {
                const column = schema.columns.find(c => c.id === colId)
                if (!column) return null
                const isIncrease = change.delta > 0

                return (
                  <div
                    key={colId}
                    className="p-2 bg-orange-50 rounded-lg border border-orange-100"
                  >
                    <div className="text-xs text-gray-500 mb-1">{column.label}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 line-through">
                        {formatValue(change.prior, column.type)}
                      </span>
                      <span className="text-gray-500">→</span>
                      <span className="font-medium">
                        {formatValue(change.current, column.type)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs ${
                          isIncrease
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isIncrease ? "+" : ""}
                        {change.deltaPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Activity Log Section (placeholder) */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Activity
          </h4>
          {activityLog.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No activity recorded</p>
          ) : (
            <div className="space-y-2">
              {activityLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-xs">
                  <Clock className="w-3 h-3 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-700">{entry.description}</p>
                    <p className="text-gray-400">
                      {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {row._deltaType === "REMOVED" ? "Removed in current period" : ""}
        </span>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        )}
      </div>
    </div>
  )
}

// Helper to format values
function formatValue(value: any, type: string): string {
  if (value === null || value === undefined) return "—"

  if (type === "currency" || type === "amount") {
    const num = Number(value)
    if (isNaN(num)) return String(value)
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num)
  }

  if (type === "percent") {
    const pct = Number(value)
    if (isNaN(pct)) return String(value)
    return `${pct.toFixed(1)}%`
  }

  if (type === "number") {
    const n = Number(value)
    if (isNaN(n)) return String(value)
    return new Intl.NumberFormat("en-US").format(n)
  }

  return String(value)
}
