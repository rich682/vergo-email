"use client"

import { useState, useEffect, useCallback } from "react"
import { TableGrid } from "./table-grid"
import { TableSchemaEditor, TableSchema } from "./schema-editor"
import { ImportModal } from "./import-modal"
import { ImportSummaryModal } from "./import-summary-modal"
import { RowSidePanel } from "./row-side-panel"
import { TableRowData } from "./table-row"

interface ImportMetadata {
  lastImportedAt?: string
  lastImportedBy?: string
  lastImportedByEmail?: string
  importSource?: string
  rowsAdded?: number
  rowsUpdated?: number
  rowsRemoved?: number
  totalRows?: number
}

interface ImportSummary {
  rowsAdded: number
  rowsUpdated: number
  rowsUnchanged: number
  errors: Array<{ row: number; error: string }>
  filename?: string
}

interface DataTabProps {
  taskInstanceId: string
  lineageId: string | null
  isSnapshot?: boolean
  isAdHoc?: boolean
  onConvertToRecurring?: () => void
}

export function DataTab({
  taskInstanceId,
  lineageId,
  isSnapshot,
  isAdHoc,
  onConvertToRecurring,
}: DataTabProps) {
  // Data state
  const [schema, setSchema] = useState<TableSchema | null>(null)
  const [rows, setRows] = useState<TableRowData[]>([])
  const [importMetadata, setImportMetadata] = useState<ImportMetadata | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [isSchemaEditorOpen, setIsSchemaEditorOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

  // Selection state
  const [selectedRowIdentity, setSelectedRowIdentity] = useState<any>(null)

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/table/rows`,
        { credentials: "include" }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load table data")
      }

      const data = await response.json()
      setSchema(data.schema)
      setRows(data.rows || [])
      setImportMetadata(data.importMetadata)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [taskInstanceId])

  // Fetch schema (for lineage)
  const fetchSchema = useCallback(async () => {
    if (!lineageId) return

    try {
      const response = await fetch(
        `/api/task-lineages/${lineageId}/schema`,
        { credentials: "include" }
      )

      if (response.ok) {
        const data = await response.json()
        setSchema(data.schema)
      }
    } catch (err) {
      console.error("Error fetching schema:", err)
    }
  }, [lineageId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle schema save
  const handleSchemaSave = async (newSchema: TableSchema) => {
    if (!lineageId) {
      throw new Error("Cannot save schema: no lineage ID")
    }

    const response = await fetch(`/api/task-lineages/${lineageId}/schema`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(newSchema),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "Failed to save schema")
    }

    setSchema(newSchema)
  }

  // Handle cell update
  const handleCellUpdate = async (rowIdentity: any, columnId: string, value: any) => {
    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/table/cell`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ identityValue: rowIdentity, columnId, value }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update cell")
      }

      // Optimistically update local state
      setRows((prev) =>
        prev.map((row) => {
          if (schema && row[schema.identityKey] === rowIdentity) {
            return { ...row, [columnId]: value }
          }
          return row
        })
      )
    } catch (err: any) {
      console.error("Cell update error:", err)
      // Refresh data on error
      fetchData()
    }
  }

  // Handle import complete
  const handleImportComplete = (summary: any) => {
    setImportSummary({
      rowsAdded: summary.rowsAdded || 0,
      rowsUpdated: summary.rowsUpdated || 0,
      rowsUnchanged: summary.rowsUnchanged || 0,
      errors: summary.errors || [],
    })
    fetchData()
  }

  // Get selected row
  const selectedRow = selectedRowIdentity && schema
    ? rows.find((r) => r[schema.identityKey] === selectedRowIdentity) || null
    : null

  return (
    <>
      <TableGrid
        schema={schema}
        rows={rows}
        mode="data"
        importMetadata={importMetadata}
        onCellUpdate={handleCellUpdate}
        onRowSelect={setSelectedRowIdentity}
        onImportClick={() => setIsImportModalOpen(true)}
        onSchemaClick={() => setIsSchemaEditorOpen(true)}
        onRefresh={fetchData}
        onConvertToRecurring={onConvertToRecurring}
        isLoading={loading}
        isSnapshot={isSnapshot}
        isAdHoc={isAdHoc}
        selectedRowIdentity={selectedRowIdentity}
      />

      {/* Schema Editor Modal */}
      {lineageId && (
        <TableSchemaEditor
          open={isSchemaEditorOpen}
          onOpenChange={setIsSchemaEditorOpen}
          lineageId={lineageId}
          lineageName="Table Schema"
          initialSchema={schema || undefined}
          onSave={handleSchemaSave}
        />
      )}

      {/* Import Modal */}
      {schema && (
        <ImportModal
          open={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
          taskInstanceId={taskInstanceId}
          schema={schema}
          onImportComplete={handleImportComplete}
        />
      )}

      {/* Import Summary Modal */}
      <ImportSummaryModal
        open={!!importSummary}
        onOpenChange={(open) => !open && setImportSummary(null)}
        summary={importSummary ? {
          ...importSummary,
          rowsRemoved: 0, // Not tracked in current implementation
        } : null}
        onViewChanges={() => {
          setImportSummary(null)
          // Could navigate to compare view if available
        }}
      />

      {/* Row Side Panel */}
      <RowSidePanel
        open={!!selectedRow}
        onClose={() => setSelectedRowIdentity(null)}
        taskInstanceId={taskInstanceId}
        row={selectedRow}
        schema={schema}
        isSnapshot={isSnapshot}
        onRefresh={fetchData}
      />
    </>
  )
}
