"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineFilterBuilder } from "./inline-filter-builder"

interface DatabaseInfo {
  id: string
  name: string
}

interface SchemaColumn {
  key: string
  label: string
  dataType: string
}

interface DatabaseRecipientConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function DatabaseRecipientConfig({ params, onChange }: DatabaseRecipientConfigProps) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [columns, setColumns] = useState<SchemaColumn[]>([])
  const [loadingDbs, setLoadingDbs] = useState(true)
  const [loadingCols, setLoadingCols] = useState(false)

  const selectedDbId = params.databaseId as string | undefined
  const emailColumnKey = params.emailColumnKey as string | undefined
  const nameColumnKey = params.nameColumnKey as string | undefined
  const filters = (params.filters as Array<{ columnKey: string; operator: string; value?: unknown }>) || []

  // Load databases list
  useEffect(() => {
    fetch("/api/databases")
      .then((r) => (r.ok ? r.json() : { databases: [] }))
      .then((data) => setDatabases(data.databases || []))
      .catch(() => {})
      .finally(() => setLoadingDbs(false))
  }, [])

  // Load columns when database selected
  useEffect(() => {
    if (!selectedDbId) {
      setColumns([])
      return
    }
    setLoadingCols(true)
    fetch(`/api/databases/${selectedDbId}/columns`)
      .then((r) => (r.ok ? r.json() : { columns: [] }))
      .then((data) => setColumns(data.columns || []))
      .catch(() => {})
      .finally(() => setLoadingCols(false))
  }, [selectedDbId])

  const setDatabase = (dbId: string) => {
    onChange({
      ...params,
      databaseId: dbId,
      emailColumnKey: undefined,
      nameColumnKey: undefined,
      filters: [],
    })
  }

  return (
    <div className="space-y-3 pl-1">
      {/* Database picker */}
      <div>
        <Label className="text-xs text-gray-500">Database</Label>
        <Select value={selectedDbId || ""} onValueChange={setDatabase}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={loadingDbs ? "Loading..." : "Select a database"} />
          </SelectTrigger>
          <SelectContent>
            {databases.map((db) => (
              <SelectItem key={db.id} value={db.id}>
                {db.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedDbId && columns.length > 0 && (
        <>
          {/* Email column */}
          <div>
            <Label className="text-xs text-gray-500">Email column</Label>
            <Select
              value={emailColumnKey || ""}
              onValueChange={(v) => onChange({ ...params, emailColumnKey: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={loadingCols ? "Loading..." : "Which column has emails?"} />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name column (optional) */}
          <div>
            <Label className="text-xs text-gray-500">Name column (optional)</Label>
            <Select
              value={nameColumnKey || "__none__"}
              onValueChange={(v) =>
                onChange({ ...params, nameColumnKey: v === "__none__" ? undefined : v })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Optional: column for recipient name" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {columns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Inline filters */}
          <InlineFilterBuilder
            columns={columns}
            filters={filters}
            onChange={(newFilters) => onChange({ ...params, filters: newFilters })}
          />
        </>
      )}

      {selectedDbId && loadingCols && (
        <p className="text-xs text-gray-400">Loading columns...</p>
      )}
    </div>
  )
}
