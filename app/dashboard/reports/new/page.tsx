"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/components/permissions-context"
import Link from "next/link"
import { ArrowLeft, Database, Loader2, Calendar, LayoutGrid, Table2 } from "lucide-react"
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
import { type DatabaseOption, type DatabaseColumn, type DatabaseDetail } from "@/components/reports/report-config-shared"

const CADENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
]

type ReportLayout = "pivot" | "accounting"

const LAYOUT_OPTIONS: Array<{ value: ReportLayout; label: string; description: string; icon: typeof LayoutGrid }> = [
  {
    value: "pivot",
    label: "Pivot",
    description: "Each data row becomes a column. Good for comparing entities side by side.",
    icon: LayoutGrid,
  },
  {
    value: "accounting",
    label: "Accounting",
    description: "Row labels down the left, time periods across the top. Ideal for P&L, balance sheets.",
    icon: Table2,
  },
]

export default function NewReportPage() {
  const router = useRouter()
  const { can } = usePermissions()

  // Redirect if user lacks manage permission
  useEffect(() => {
    if (!can("reports:manage")) {
      router.replace("/dashboard/reports")
    }
  }, [can, router])

  const [databases, setDatabases] = useState<DatabaseOption[]>([])
  const [loadingDatabases, setLoadingDatabases] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedBoardTypes, setAdvancedBoardTypes] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [cadence, setCadence] = useState("monthly")
  const [layout, setLayout] = useState<ReportLayout>("pivot")
  const [databaseId, setDatabaseId] = useState("")
  const [pivotColumnKey, setPivotColumnKey] = useState("")
  // Accounting layout fields
  const [rowColumnKey, setRowColumnKey] = useState("")
  const [valueColumnKey, setValueColumnKey] = useState("")

  // Database detail state (for getting columns)
  const [databaseDetail, setDatabaseDetail] = useState<DatabaseDetail | null>(null)
  const [loadingDatabaseDetail, setLoadingDatabaseDetail] = useState(false)

  // Fetch available databases
  const fetchDatabases = useCallback(async () => {
    try {
      setLoadingDatabases(true)
      const response = await fetch("/api/databases", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setDatabases(data.databases || [])
      }
    } catch (err) {
      console.error("Error fetching databases:", err)
    } finally {
      setLoadingDatabases(false)
    }
  }, [])

  // Fetch database detail when database is selected
  const fetchDatabaseDetail = useCallback(async (id: string) => {
    if (!id) {
      setDatabaseDetail(null)
      return
    }
    try {
      setLoadingDatabaseDetail(true)
      const response = await fetch(`/api/databases/${id}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setDatabaseDetail(data.database)
      }
    } catch (err) {
      console.error("Error fetching database detail:", err)
    } finally {
      setLoadingDatabaseDetail(false)
    }
  }, [])

  // Fetch feature flags
  useEffect(() => {
    const fetchFeatureFlags = async () => {
      try {
        const response = await fetch("/api/boards", { credentials: "include" })
        if (response.ok) {
          const data = await response.json()
          setAdvancedBoardTypes(data.advancedBoardTypes || false)
          if (!data.advancedBoardTypes) {
            setCadence("monthly")
          }
        }
      } catch (err) {
        console.error("Error fetching feature flags:", err)
      }
    }
    fetchFeatureFlags()
  }, [])

  useEffect(() => {
    fetchDatabases()
  }, [fetchDatabases])

  // Fetch database detail when selection changes
  useEffect(() => {
    if (databaseId) {
      fetchDatabaseDetail(databaseId)
      setPivotColumnKey("")
      setRowColumnKey("")
      setValueColumnKey("")
    } else {
      setDatabaseDetail(null)
    }
  }, [databaseId, fetchDatabaseDetail])

  // Reset column selections when layout changes
  useEffect(() => {
    setPivotColumnKey("")
    setRowColumnKey("")
    setValueColumnKey("")
  }, [layout])

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Report name is required")
      return
    }
    if (advancedBoardTypes && !cadence) {
      setError("Please select a cadence")
      return
    }
    if (!databaseId) {
      setError("Please select a database")
      return
    }
    if (!pivotColumnKey) {
      setError(layout === "accounting" ? "Please select a period column" : "Please select a column")
      return
    }
    if (layout === "accounting" && !rowColumnKey) {
      setError("Please select a row column")
      return
    }
    if (layout === "accounting" && !valueColumnKey) {
      setError("Please select a value column")
      return
    }

    setCreating(true)
    setError(null)

    try {
      const dbColumns = databaseDetail?.schema?.columns || []

      if (layout === "accounting") {
        // Accounting layout: row column, period column, value column
        // Auto-detect group column if one exists
        const groupCol = dbColumns.find((c: DatabaseColumn) => c.dataType === "group")
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            cadence,
            layout: "accounting",
            databaseId,
            dateColumnKey: pivotColumnKey,
            pivotColumnKey,
            rowColumnKey,
            valueColumnKey,
            ...(groupCol ? { groupByColumnKey: groupCol.key } : {}),
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to create report")
        }

        const data = await response.json()
        router.push(`/dashboard/reports/${data.report.id}`)
      } else {
        // Pivot layout: auto-populate metric rows from database columns
        const formatMap: Record<string, "text" | "number" | "currency" | "percent"> = {
          text: "text",
          number: "number",
          currency: "currency",
          date: "text",
          boolean: "text",
        }
        const autoMetricRows = dbColumns.map((col: DatabaseColumn, index: number) => ({
          key: `metric_${col.key}`,
          label: col.label,
          type: "source" as const,
          sourceColumnKey: col.key,
          format: formatMap[col.dataType] || "number",
          order: index,
        }))

        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            cadence,
            layout: "pivot",
            databaseId,
            dateColumnKey: pivotColumnKey,
            pivotColumnKey,
            metricRows: autoMetricRows,
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to create report")
        }

        const data = await response.json()
        router.push(`/dashboard/reports/${data.report.id}`)
      }
    } catch (err: any) {
      setError(err.message || "Failed to create report")
      setCreating(false)
    }
  }

  const selectedDatabase = databases.find(db => db.id === databaseId)
  const databaseColumns = databaseDetail?.schema?.columns || []

  const isFormValid = layout === "accounting"
    ? name.trim() && cadence && databaseId && pivotColumnKey && rowColumnKey && valueColumnKey
    : name.trim() && cadence && databaseId && pivotColumnKey

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/reports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">New Report</h1>
              <p className="mt-1 text-sm text-gray-500">
                Create a new report template based on a database
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-6">
            {/* Report Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Report Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Monthly P&L Report"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of what this report shows..."
                rows={3}
              />
            </div>

            {/* Layout Selection */}
            <div className="space-y-2">
              <Label>Report Layout *</Label>
              <div className="grid grid-cols-2 gap-3">
                {LAYOUT_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const isSelected = layout === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLayout(option.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        isSelected
                          ? "border-orange-500 bg-orange-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${isSelected ? "text-orange-600" : "text-gray-400"}`} />
                        <span className={`text-sm font-medium ${isSelected ? "text-orange-900" : "text-gray-700"}`}>
                          {option.label}
                        </span>
                      </div>
                      <p className={`text-xs ${isSelected ? "text-orange-700" : "text-gray-500"}`}>
                        {option.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cadence Selection - only shown when Advanced Board Types is enabled */}
            {advancedBoardTypes && (
              <div className="space-y-2">
                <Label>Cadence *</Label>
                <p className="text-xs text-gray-500 mb-2">
                  Determines which period-based tasks can use this report
                </p>
                <Select value={cadence} onValueChange={setCadence}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cadence..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CADENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Database Selection */}
            <div className="space-y-2">
              <Label>Data Source *</Label>
              {loadingDatabases ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading databases...
                </div>
              ) : databases.length === 0 ? (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-700">No databases available</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Create a database first to use as the data source for your report.
                      </p>
                    </div>
                  </div>
                  <Link href="/dashboard/databases/new" className="mt-3 inline-block">
                    <Button variant="outline" size="sm">
                      Create Database
                    </Button>
                  </Link>
                </div>
              ) : (
                <Select value={databaseId} onValueChange={setDatabaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a database..." />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((db) => (
                      <SelectItem key={db.id} value={db.id}>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-gray-400" />
                          <span>{db.name}</span>
                          <span className="text-xs text-gray-400">
                            ({db.rowCount} rows, {db.columnCount} cols)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Column Selection - varies by layout */}
            {databaseId && (
              <>
                {layout === "accounting" ? (
                  <>
                    {/* Accounting: Row Column */}
                    <div className="space-y-2">
                      <Label>Row Column *</Label>
                      <p className="text-xs text-gray-500 mb-2">
                        Column that identifies each row (e.g., GL Account Name)
                      </p>
                      {loadingDatabaseDetail ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading columns...
                        </div>
                      ) : (
                        <Select value={rowColumnKey} onValueChange={setRowColumnKey}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select row column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {databaseColumns.map((col) => (
                              <SelectItem key={col.key} value={col.key}>
                                <div className="flex items-center gap-2">
                                  <span>{col.label}</span>
                                  <span className="text-xs text-gray-400">({col.dataType})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Accounting: Period Column */}
                    <div className="space-y-2">
                      <Label>Period Column *</Label>
                      <p className="text-xs text-gray-500 mb-2">
                        Date column whose unique values become column headers (e.g., Month)
                      </p>
                      {loadingDatabaseDetail ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading columns...
                        </div>
                      ) : (
                        <Select value={pivotColumnKey} onValueChange={setPivotColumnKey}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select period column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {databaseColumns.map((col) => (
                              <SelectItem key={col.key} value={col.key}>
                                <div className="flex items-center gap-2">
                                  <span>{col.label}</span>
                                  <span className="text-xs text-gray-400">({col.dataType})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Accounting: Value Column */}
                    <div className="space-y-2">
                      <Label>Value Column *</Label>
                      <p className="text-xs text-gray-500 mb-2">
                        Numeric column providing cell values (e.g., Amount, Balance)
                      </p>
                      {loadingDatabaseDetail ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading columns...
                        </div>
                      ) : (
                        <Select value={valueColumnKey} onValueChange={setValueColumnKey}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select value column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {databaseColumns.map((col) => (
                              <SelectItem key={col.key} value={col.key}>
                                <div className="flex items-center gap-2">
                                  <span>{col.label}</span>
                                  <span className="text-xs text-gray-400">({col.dataType})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </>
                ) : (
                  /* Pivot: single column selection */
                  <div className="space-y-2">
                    <Label>Column *</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      Column whose unique values become column headers (e.g., Project Name, Period)
                    </p>
                    {loadingDatabaseDetail ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading columns...
                      </div>
                    ) : databaseColumns.length === 0 ? (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-700">
                        No columns found in the selected database.
                      </div>
                    ) : (
                      <Select value={pivotColumnKey} onValueChange={setPivotColumnKey}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a column..." />
                        </SelectTrigger>
                        <SelectContent>
                          {databaseColumns.map((col) => (
                            <SelectItem key={col.key} value={col.key}>
                              <div className="flex items-center gap-2">
                                <span>{col.label}</span>
                                <span className="text-xs text-gray-400">({col.dataType})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Summary */}
            {selectedDatabase && pivotColumnKey && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      {selectedDatabase.name}
                    </p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      {selectedDatabase.rowCount.toLocaleString()} rows
                      {cadence && ` • ${CADENCE_OPTIONS.find(o => o.value === cadence)?.label}`}
                      {" "}• {LAYOUT_OPTIONS.find(o => o.value === layout)?.label} layout
                      {layout === "accounting" && rowColumnKey && (
                        <> • Rows: {databaseColumns.find(c => c.key === rowColumnKey)?.label || rowColumnKey}</>
                      )}
                      {" "}• {layout === "accounting" ? "Period" : "Column"}: {databaseColumns.find(c => c.key === pivotColumnKey)?.label || pivotColumnKey}
                      {layout === "accounting" && valueColumnKey && (
                        <> • Values: {databaseColumns.find(c => c.key === valueColumnKey)?.label || valueColumnKey}</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Link href="/dashboard/reports">
                <Button variant="outline">Cancel</Button>
              </Link>
              <Button
                onClick={handleCreate}
                disabled={creating || !isFormValid}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Report"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
