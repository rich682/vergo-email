"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { TableHeader, SortDirection } from "./table-header"
import { TableRow, TableRowData, RowDeltaType } from "./table-row"
import { TableToolbar } from "./table-toolbar"
import { TableSchema, TableColumn } from "./schema-editor"
import { FileSpreadsheet, AlertCircle } from "lucide-react"

interface ImportMetadata {
  lastImportedAt?: string
  lastImportedBy?: string
  importSource?: string
  rowsAdded?: number
  rowsUpdated?: number
  rowsRemoved?: number
}

interface TableGridProps {
  // Schema configuration
  schema: TableSchema | null
  
  // Row data
  rows: TableRowData[]
  
  // Mode
  mode?: "data" | "compare"
  
  // Import metadata for trust signals
  importMetadata?: ImportMetadata
  
  // Callbacks
  onCellUpdate?: (rowIdentity: any, columnId: string, value: any) => void
  onRowSelect?: (rowIdentity: any) => void
  onImportClick: () => void
  onSchemaClick: () => void
  onRefresh: () => void
  onExport?: () => void
  onConvertToRecurring?: () => void
  
  // State
  isLoading?: boolean
  isSnapshot?: boolean
  isAdHoc?: boolean
  selectedRowIdentity?: any
}

export function TableGrid({
  schema,
  rows,
  mode = "data",
  importMetadata,
  onCellUpdate,
  onRowSelect,
  onImportClick,
  onSchemaClick,
  onRefresh,
  onExport,
  onConvertToRecurring,
  isLoading,
  isSnapshot,
  isAdHoc,
  selectedRowIdentity,
}: TableGridProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [filterDeltaType, setFilterDeltaType] = useState<RowDeltaType | "all">("all")

  // Handle sort toggle
  const handleSort = useCallback((columnId: string) => {
    if (sortColumn === columnId) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc")
      } else if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(columnId)
      setSortDirection("asc")
    }
  }, [sortColumn, sortDirection])

  // Filter and sort rows
  const processedRows = useMemo(() => {
    let result = [...rows]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((row) => {
        return Object.values(row).some((value) => {
          if (value === null || value === undefined) return false
          return String(value).toLowerCase().includes(query)
        })
      })
    }

    // Apply delta type filter (for compare mode)
    if (mode === "compare" && filterDeltaType !== "all") {
      result = result.filter((row) => row._deltaType === filterDeltaType)
    }

    // Apply sort
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]

        // Handle nulls
        if (aVal === null || aVal === undefined) return sortDirection === "asc" ? 1 : -1
        if (bVal === null || bVal === undefined) return sortDirection === "asc" ? -1 : 1

        // Numeric comparison
        const aNum = Number(aVal)
        const bNum = Number(bVal)
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === "asc" ? aNum - bNum : bNum - aNum
        }

        // String comparison
        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()
        if (sortDirection === "asc") {
          return aStr.localeCompare(bStr)
        }
        return bStr.localeCompare(aStr)
      })
    }

    return result
  }, [rows, searchQuery, sortColumn, sortDirection, filterDeltaType, mode])

  // No schema defined
  if (!schema || schema.columns.length === 0) {
    return (
      <div className="space-y-4">
        <TableToolbar
          searchQuery=""
          onSearchChange={() => {}}
          filterDeltaType="all"
          onFilterChange={() => {}}
          onImportClick={onImportClick}
          onSchemaClick={onSchemaClick}
          onRefresh={onRefresh}
          totalRows={0}
          filteredRows={0}
          isAdHoc={isAdHoc}
          onConvertToRecurring={onConvertToRecurring}
        />
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Schema Required</h3>
          <p className="text-sm text-gray-500 mb-4">
            Configure the table schema before importing data.
          </p>
          <button
            onClick={onSchemaClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Configure Schema
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <TableToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterDeltaType={filterDeltaType}
          onFilterChange={setFilterDeltaType}
          showDeltaFilter={mode === "compare"}
          onImportClick={onImportClick}
          onSchemaClick={onSchemaClick}
          onRefresh={onRefresh}
          onExport={onExport}
          importMetadata={importMetadata}
          isAdHoc={isAdHoc}
          onConvertToRecurring={onConvertToRecurring}
          totalRows={rows.length}
          filteredRows={processedRows.length}
          isSnapshot={isSnapshot}
        />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    )
  }

  // Empty state (no rows)
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <TableToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterDeltaType={filterDeltaType}
          onFilterChange={setFilterDeltaType}
          showDeltaFilter={mode === "compare"}
          onImportClick={onImportClick}
          onSchemaClick={onSchemaClick}
          onRefresh={onRefresh}
          onExport={onExport}
          importMetadata={importMetadata}
          isAdHoc={isAdHoc}
          onConvertToRecurring={onConvertToRecurring}
          totalRows={0}
          filteredRows={0}
          isSnapshot={isSnapshot}
        />
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No Data Yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Import a CSV or Excel file to populate this table.
          </p>
          {!isSnapshot && (
            <button
              onClick={onImportClick}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Import Data
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterDeltaType={filterDeltaType}
        onFilterChange={setFilterDeltaType}
        showDeltaFilter={mode === "compare"}
        onImportClick={onImportClick}
        onSchemaClick={onSchemaClick}
        onRefresh={onRefresh}
        onExport={onExport}
        importMetadata={importMetadata}
        isAdHoc={isAdHoc}
        onConvertToRecurring={onConvertToRecurring}
        totalRows={rows.length}
        filteredRows={processedRows.length}
        isSnapshot={isSnapshot}
      />

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <TableHeader
              columns={schema.columns}
              identityKey={schema.identityKey}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <tbody className="divide-y divide-gray-100 bg-white">
              {processedRows.map((row) => {
                const rowIdentity = row[schema.identityKey]
                return (
                  <TableRow
                    key={String(rowIdentity)}
                    row={row}
                    columns={schema.columns}
                    identityKey={schema.identityKey}
                    onCellUpdate={onCellUpdate}
                    onRowClick={onRowSelect}
                    isSelected={selectedRowIdentity === rowIdentity}
                    isSnapshot={isSnapshot}
                    showRowBadge={mode === "compare" || row._deltaType !== undefined}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* No results after filtering */}
      {processedRows.length === 0 && rows.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No rows match your search or filter criteria.</p>
          <button
            onClick={() => {
              setSearchQuery("")
              setFilterDeltaType("all")
            }}
            className="text-blue-600 hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
