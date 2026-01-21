"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { 
  RefreshCw, 
  ArrowLeftRight, 
  TrendingUp, 
  TrendingDown,
  Minus as MinusIcon,
  Plus,
  AlertCircle,
  Calendar,
} from "lucide-react"
import { format } from "date-fns"
import { TableGrid } from "./table-grid"
import { VarianceFilter, VarianceFilterState, applyVarianceFilters } from "./variance-filter"
import { TableSchema } from "./schema-editor"
import { TableRowData, RowDeltaType } from "./table-row"
import { RowSidePanel } from "./row-side-panel"

interface PeriodInfo {
  boardId?: string
  boardName?: string
  periodStart?: string
  periodEnd?: string
}

interface ColumnSummary {
  columnId: string
  columnLabel: string
  columnType: string
  totalCurrentValue: number
  totalPriorValue: number
  totalDelta: number
  totalDeltaPct: number
}

interface CompareViewProps {
  taskInstanceId: string
  onRefresh?: () => void
}

interface CompareData {
  schema: TableSchema | null
  rows: TableRowData[]
  currentPeriod: PeriodInfo
  priorPeriod: PeriodInfo
  summary: {
    totalRows: number
    addedCount: number
    changedCount: number
    removedCount: number
    unchangedCount: number
    columnSummaries: ColumnSummary[]
  }
}

const DEFAULT_FILTERS: VarianceFilterState = {
  deltaTypes: ["ADDED", "CHANGED"],
  thresholdType: null,
  thresholdValue: null,
  showUnchanged: false,
  columnId: null,
}

export function CompareView({ taskInstanceId, onRefresh }: CompareViewProps) {
  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorReason, setErrorReason] = useState<string | null>(null)
  const [filters, setFilters] = useState<VarianceFilterState>(DEFAULT_FILTERS)
  const [selectedRowIdentity, setSelectedRowIdentity] = useState<any>(null)

  // Fetch comparison data
  const fetchCompareData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorReason(null)

    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/table/compare`,
        { credentials: "include" }
      )

      if (!response.ok) {
        const errorData = await response.json()
        setErrorReason(errorData.reason || null)
        throw new Error(errorData.error || "Failed to load comparison data")
      }

      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [taskInstanceId])

  useEffect(() => {
    fetchCompareData()
  }, [fetchCompareData])

  // Apply filters to rows
  const filteredRows = useMemo(() => {
    if (!data?.rows) return []
    return applyVarianceFilters(data.rows, filters)
  }, [data?.rows, filters])

  // Get comparable columns for filter
  const comparableColumns = useMemo(() => {
    if (!data?.schema) return []
    return data.schema.columns
      .filter((c) => c.isComparable)
      .map((c) => ({ id: c.id, label: c.label, type: c.type }))
  }, [data?.schema])

  // Get selected row
  const selectedRow = useMemo(() => {
    if (!selectedRowIdentity || !data?.schema) return null
    return data.rows.find(
      (r) => r[data.schema!.identityKey] === selectedRowIdentity
    ) || null
  }, [selectedRowIdentity, data])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    )
  }

  // Error state
  if (error) {
    const isNoSnapshot = errorReason === "NO_PRIOR_SNAPSHOT"
    
    return (
      <div className="text-center py-12">
        <AlertCircle className={`w-12 h-12 mx-auto mb-3 ${isNoSnapshot ? 'text-gray-300' : 'text-amber-400'}`} />
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          {isNoSnapshot ? "No Prior Period Snapshot" : "Cannot Load Comparison"}
        </h3>
        <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
          {isNoSnapshot 
            ? "To compare periods, mark the previous board as Complete. This creates a snapshot of that period's data for comparison."
            : error}
        </p>
        {!isNoSnapshot && (
          <Button variant="outline" onClick={fetchCompareData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    )
  }

  if (!data || !data.schema) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No comparison data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Period comparison header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
        <div className="flex items-center gap-6">
          {/* Prior period */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">Prior Period</div>
            <div className="font-medium text-gray-700">
              {data.priorPeriod.boardName || "Previous"}
            </div>
            {data.priorPeriod.periodStart && (
              <div className="text-xs text-gray-400 flex items-center gap-1 justify-center mt-0.5">
                <Calendar className="w-3 h-3" />
                {format(new Date(data.priorPeriod.periodStart), "MMM d, yyyy")}
              </div>
            )}
          </div>

          <ArrowLeftRight className="w-5 h-5 text-gray-400" />

          {/* Current period */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">Current Period</div>
            <div className="font-medium text-gray-900">
              {data.currentPeriod.boardName || "Current"}
            </div>
            {data.currentPeriod.periodStart && (
              <div className="text-xs text-gray-400 flex items-center gap-1 justify-center mt-0.5">
                <Calendar className="w-3 h-3" />
                {format(new Date(data.currentPeriod.periodStart), "MMM d, yyyy")}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <VarianceFilter
            filters={filters}
            onFiltersChange={setFilters}
            comparableColumns={comparableColumns}
            summary={data.summary}
          />
          <Button variant="ghost" size="sm" onClick={fetchCompareData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="Added"
          count={data.summary.addedCount}
          icon={<Plus className="w-4 h-4" />}
          color="green"
        />
        <SummaryCard
          label="Changed"
          count={data.summary.changedCount}
          icon={<RefreshCw className="w-4 h-4" />}
          color="orange"
        />
        <SummaryCard
          label="Removed"
          count={data.summary.removedCount}
          icon={<MinusIcon className="w-4 h-4" />}
          color="red"
        />
        <SummaryCard
          label="Unchanged"
          count={data.summary.unchangedCount}
          icon={<MinusIcon className="w-4 h-4" />}
          color="gray"
        />
      </div>

      {/* Column-level variance summary */}
      {data.summary.columnSummaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.summary.columnSummaries.map((col) => (
            <ColumnVarianceCard key={col.columnId} column={col} />
          ))}
        </div>
      )}

      {/* Table grid in compare mode */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-12 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                {data.schema.columns.map((col) => (
                  <th
                    key={col.id}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                    colSpan={col.isComparable ? 3 : 1}
                  >
                    {col.label}
                    {col.isComparable && (
                      <div className="flex text-[10px] font-normal normal-case text-gray-400 mt-0.5">
                        <span className="flex-1">Current</span>
                        <span className="flex-1">Prior</span>
                        <span className="flex-1">Delta</span>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredRows.map((row) => (
                <CompareRow
                  key={String(row[data.schema!.identityKey])}
                  row={row}
                  schema={data.schema!}
                  onClick={() => setSelectedRowIdentity(row[data.schema!.identityKey])}
                  isSelected={selectedRowIdentity === row[data.schema!.identityKey]}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty filtered state */}
      {filteredRows.length === 0 && data.rows.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No rows match your filter criteria.</p>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-blue-600 hover:underline mt-2"
          >
            Reset filters
          </button>
        </div>
      )}

      {/* Row side panel */}
      <RowSidePanel
        open={!!selectedRow}
        onClose={() => setSelectedRowIdentity(null)}
        taskInstanceId={taskInstanceId}
        row={selectedRow}
        schema={data.schema}
        isSnapshot={false}
        onRefresh={fetchCompareData}
      />
    </div>
  )
}

// Summary card component
function SummaryCard({
  label,
  count,
  icon,
  color,
}: {
  label: string
  count: number
  icon: React.ReactNode
  color: "green" | "orange" | "red" | "gray"
}) {
  const colorClasses = {
    green: "bg-green-50 border-green-200 text-green-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    red: "bg-red-50 border-red-200 text-red-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="opacity-60">{icon}</div>
      <div>
        <div className="text-lg font-semibold">{count}</div>
        <div className="text-xs opacity-75">{label}</div>
      </div>
    </div>
  )
}

// Column variance card
function ColumnVarianceCard({ column }: { column: ColumnSummary }) {
  const isPositive = column.totalDelta > 0
  const isNegative = column.totalDelta < 0

  const formatValue = (val: number) => {
    if (column.columnType === "currency" || column.columnType === "amount") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val)
    }
    if (column.columnType === "percent") {
      return `${val.toFixed(1)}%`
    }
    return new Intl.NumberFormat("en-US").format(val)
  }

  return (
    <div className="p-3 bg-white rounded-lg border">
      <div className="text-xs text-gray-500 mb-1">{column.columnLabel}</div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-900">
          {formatValue(column.totalCurrentValue)}
        </div>
        <div
          className={`flex items-center gap-1 text-sm ${
            isPositive
              ? "text-red-600"
              : isNegative
              ? "text-green-600"
              : "text-gray-500"
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : isNegative ? (
            <TrendingDown className="w-3 h-3" />
          ) : null}
          <span>
            {isPositive ? "+" : ""}
            {column.totalDeltaPct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Prior: {formatValue(column.totalPriorValue)}
      </div>
    </div>
  )
}

// Compare row component
function CompareRow({
  row,
  schema,
  onClick,
  isSelected,
}: {
  row: TableRowData
  schema: TableSchema
  onClick: () => void
  isSelected: boolean
}) {
  const deltaType = row._deltaType as RowDeltaType
  const isRemoved = deltaType === "REMOVED"

  const getBadge = () => {
    switch (deltaType) {
      case "ADDED":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
            <Plus className="w-3 h-3" />
          </span>
        )
      case "CHANGED":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
            <RefreshCw className="w-3 h-3" />
          </span>
        )
      case "REMOVED":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">
            <MinusIcon className="w-3 h-3" />
          </span>
        )
      default:
        return null
    }
  }

  return (
    <tr
      className={`
        cursor-pointer transition-colors
        ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}
        ${isRemoved ? "opacity-50 bg-gray-50" : ""}
      `}
      onClick={onClick}
    >
      <td className="px-3 py-2">{getBadge()}</td>
      {schema.columns.map((col) => {
        const value = row[col.id]
        const change = row._changes?.[col.id]

        if (col.isComparable) {
          return (
            <td key={col.id} colSpan={3} className="px-1 py-2">
              <div className="flex">
                <div className="flex-1 px-2">{formatCellValue(value, col.type)}</div>
                <div className="flex-1 px-2 text-gray-400">
                  {change ? formatCellValue(change.prior, col.type) : "—"}
                </div>
                <div className="flex-1 px-2">
                  {change ? (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        change.delta > 0
                          ? "bg-red-100 text-red-700"
                          : change.delta < 0
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {change.delta > 0 ? "+" : ""}
                      {change.deltaPct.toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </td>
          )
        }

        return (
          <td key={col.id} className="px-3 py-2 text-gray-700">
            {formatCellValue(value, col.type)}
          </td>
        )
      })}
    </tr>
  )
}

// Format cell value
function formatCellValue(value: any, type: string): string {
  if (value === null || value === undefined || value === "") return "—"

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
