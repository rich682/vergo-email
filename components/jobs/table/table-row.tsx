"use client"

import { useCallback } from "react"
import { TableCell } from "./table-cell"
import { TableColumn } from "./schema-editor"
import { Plus, Minus, RefreshCw, ChevronRight } from "lucide-react"

export type RowDeltaType = "ADDED" | "CHANGED" | "REMOVED" | "UNCHANGED"

export interface TableRowData {
  [key: string]: any
  _deltaType?: RowDeltaType
  _changes?: Record<string, { prior: any; current: any; delta: number; deltaPct: number }>
}

interface TableRowProps {
  row: TableRowData
  columns: TableColumn[]
  identityKey: string
  onCellUpdate?: (rowIdentity: any, columnId: string, value: any) => void
  onRowClick?: (rowIdentity: any) => void
  isSelected?: boolean
  isSnapshot?: boolean
  showRowBadge?: boolean
}

function getRowBadge(deltaType: RowDeltaType | undefined) {
  switch (deltaType) {
    case "ADDED":
      return {
        icon: <Plus className="w-3 h-3" />,
        label: "New",
        className: "bg-green-100 text-green-700 border-green-200",
      }
    case "CHANGED":
      return {
        icon: <RefreshCw className="w-3 h-3" />,
        label: "Changed",
        className: "bg-orange-100 text-orange-700 border-orange-200",
      }
    case "REMOVED":
      return {
        icon: <Minus className="w-3 h-3" />,
        label: "Removed",
        className: "bg-red-100 text-red-700 border-red-200",
      }
    default:
      return null
  }
}

export function TableRow({
  row,
  columns,
  identityKey,
  onCellUpdate,
  onRowClick,
  isSelected,
  isSnapshot,
  showRowBadge = true,
}: TableRowProps) {
  const rowIdentity = row[identityKey]
  const badge = showRowBadge ? getRowBadge(row._deltaType) : null
  const isRemoved = row._deltaType === "REMOVED"

  const handleRowClick = useCallback(() => {
    if (onRowClick) {
      onRowClick(rowIdentity)
    }
  }, [onRowClick, rowIdentity])

  return (
    <tr
      className={`
        group transition-colors cursor-pointer
        ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}
        ${isRemoved ? "opacity-50 bg-gray-50" : ""}
      `}
      onClick={handleRowClick}
    >
      {/* Row Badge Column */}
      <td className="w-12 px-2 py-2">
        {badge && (
          <div
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${badge.className}`}
            title={badge.label}
          >
            {badge.icon}
          </div>
        )}
      </td>

      {/* Data Columns */}
      {columns.map((column) => (
        <td
          key={column.id}
          className="px-2 py-1"
          style={{ width: column.width ? `${column.width}px` : "auto" }}
        >
          <TableCell
            column={column}
            value={row[column.id]}
            rowIdentity={rowIdentity}
            onUpdate={onCellUpdate}
            isSnapshot={isSnapshot || isRemoved}
          />
        </td>
      ))}

      {/* Row Action / Expand */}
      <td className="w-10 px-2 py-2 text-right">
        <button
          className="p-1 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            handleRowClick()
          }}
        >
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </td>
    </tr>
  )
}

// Row for showing variance details (expandable sub-row)
interface VarianceDetailRowProps {
  row: TableRowData
  columns: TableColumn[]
  visible: boolean
}

export function VarianceDetailRow({ row, columns, visible }: VarianceDetailRowProps) {
  if (!visible || !row._changes || Object.keys(row._changes).length === 0) {
    return null
  }

  const comparableColumns = columns.filter(c => c.isComparable && row._changes?.[c.id])

  return (
    <tr className="bg-orange-50/50 border-t border-orange-100">
      <td colSpan={columns.length + 2} className="px-4 py-2">
        <div className="flex flex-wrap gap-4 text-xs">
          {comparableColumns.map((col) => {
            const change = row._changes![col.id]
            const isIncrease = change.delta > 0
            const isDecrease = change.delta < 0

            return (
              <div key={col.id} className="flex items-center gap-2">
                <span className="text-gray-500">{col.label}:</span>
                <span className="text-gray-400 line-through">
                  {formatVarianceValue(change.prior, col.type)}
                </span>
                <span className="text-gray-600">→</span>
                <span className="font-medium">
                  {formatVarianceValue(change.current, col.type)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    isIncrease
                      ? "bg-red-100 text-red-700"
                      : isDecrease
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {isIncrease ? "+" : ""}
                  {change.deltaPct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      </td>
    </tr>
  )
}

function formatVarianceValue(value: any, type: string): string {
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
