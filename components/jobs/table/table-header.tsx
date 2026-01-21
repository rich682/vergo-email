"use client"

import { useState } from "react"
import { TableColumn } from "./schema-editor"
import { getColumnTypeIcon } from "./column-type-selector"
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Lock,
  Edit3,
  Key,
  BarChart3,
} from "lucide-react"

export type SortDirection = "asc" | "desc" | null

interface TableHeaderProps {
  columns: TableColumn[]
  identityKey: string
  sortColumn: string | null
  sortDirection: SortDirection
  onSort: (columnId: string) => void
}

export function TableHeader({
  columns,
  identityKey,
  sortColumn,
  sortDirection,
  onSort,
}: TableHeaderProps) {
  return (
    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      <tr>
        {/* Badge Column */}
        <th className="w-12 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          {/* Empty for badge column */}
        </th>

        {/* Data Columns */}
        {columns.map((column) => (
          <th
            key={column.id}
            className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
            style={{ width: column.width ? `${column.width}px` : "auto" }}
            onClick={() => onSort(column.id)}
          >
            <div className="flex items-center gap-2">
              {/* Column type icon */}
              <span className="text-gray-400">
                {getColumnTypeIcon(column.type)}
              </span>

              {/* Column label */}
              <span className="truncate">{column.label}</span>

              {/* Indicators */}
              <div className="flex items-center gap-0.5 ml-auto">
                {/* Identity key indicator */}
                {column.id === identityKey && (
                  <Key className="w-3 h-3 text-amber-500" title="Identity Key" />
                )}

                {/* Editable indicator */}
                {column.editPolicy === "EDITABLE_COLLAB" ? (
                  <Edit3 className="w-3 h-3 text-blue-400" title="Editable" />
                ) : column.editPolicy === "READ_ONLY_IMPORTED" ? (
                  <Lock className="w-3 h-3 text-gray-400" title="Read-only (imported)" />
                ) : null}

                {/* Comparable indicator */}
                {column.isComparable && (
                  <BarChart3 className="w-3 h-3 text-purple-400" title="Comparable" />
                )}

                {/* Sort indicator */}
                {sortColumn === column.id ? (
                  sortDirection === "asc" ? (
                    <ChevronUp className="w-4 h-4 text-gray-700" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-700" />
                  )
                ) : (
                  <ChevronsUpDown className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />
                )}
              </div>
            </div>
          </th>
        ))}

        {/* Action Column */}
        <th className="w-10 px-2 py-3">
          {/* Empty for action column */}
        </th>
      </tr>
    </thead>
  )
}

// Compact header for compare view with variance columns
interface CompareHeaderProps {
  columns: TableColumn[]
  identityKey: string
  showVarianceColumns: boolean
}

export function CompareHeader({
  columns,
  identityKey,
  showVarianceColumns,
}: CompareHeaderProps) {
  return (
    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      <tr>
        {/* Badge Column */}
        <th className="w-12 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Status
        </th>

        {/* Data Columns with optional variance sub-columns */}
        {columns.map((column) => {
          const hasVariance = showVarianceColumns && column.isComparable

          return hasVariance ? (
            <th
              key={column.id}
              colSpan={4}
              className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="text-gray-400">{getColumnTypeIcon(column.type)}</span>
                <span>{column.label}</span>
                {column.id === identityKey && (
                  <Key className="w-3 h-3 text-amber-500" />
                )}
              </div>
              <div className="flex text-[10px] font-normal normal-case text-gray-400">
                <span className="flex-1">Current</span>
                <span className="flex-1">Prior</span>
                <span className="flex-1">Delta</span>
                <span className="flex-1">%</span>
              </div>
            </th>
          ) : (
            <th
              key={column.id}
              className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              style={{ width: column.width ? `${column.width}px` : "auto" }}
            >
              <div className="flex items-center gap-1">
                <span className="text-gray-400">{getColumnTypeIcon(column.type)}</span>
                <span>{column.label}</span>
                {column.id === identityKey && (
                  <Key className="w-3 h-3 text-amber-500" />
                )}
              </div>
            </th>
          )
        })}

        {/* Action Column */}
        <th className="w-10 px-2 py-3" />
      </tr>
    </thead>
  )
}
