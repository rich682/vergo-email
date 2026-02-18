"use client"

import { useState, useEffect } from "react"
import { Database, Loader2, CheckCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { mapDatabaseColumnType } from "@/lib/services/reconciliation-database.service"

// ── Types ──────────────────────────────────────────────────────────────

interface DetectedColumn {
  key: string
  label: string
  sampleValues: string[]
  suggestedType: "date" | "amount" | "text" | "reference"
}

export interface DatabaseAnalysis {
  databaseId: string
  databaseName: string
  rowCount: number
  columns: DetectedColumn[]
  dateColumnKey?: string
  cadence?: string
}

interface DatabaseOption {
  id: string
  name: string
  rowCount: number
  schema: {
    columns: {
      key: string
      label: string
      dataType: string
      order: number
    }[]
  }
}

interface DatabaseSourcePickerProps {
  side: "A" | "B"
  sideLabel: string
  sideDescription: string
  onAnalyzed: (analysis: DatabaseAnalysis) => void
  /** Currently selected database ID (for controlled state) */
  selectedDatabaseId?: string
}

// ── Component ──────────────────────────────────────────────────────────

export function DatabaseSourcePicker({
  side,
  sideLabel,
  sideDescription,
  onAnalyzed,
  selectedDatabaseId,
}: DatabaseSourcePickerProps) {
  const [databases, setDatabases] = useState<DatabaseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDb, setSelectedDb] = useState<DatabaseOption | null>(null)
  const [dateColumnKey, setDateColumnKey] = useState<string>("")
  const [cadence, setCadence] = useState<string>("monthly")

  // Fetch databases on mount
  useEffect(() => {
    setLoading(true)
    fetch("/api/databases")
      .then((r) => r.json())
      .then((data) => {
        const dbs = (data.databases || []).map((db: any) => ({
          id: db.id,
          name: db.name,
          rowCount: db.rowCount || 0,
          schema: db.schema || { columns: [] },
        }))
        setDatabases(dbs)

        // If a database was previously selected, restore it
        if (selectedDatabaseId) {
          const found = dbs.find((db: DatabaseOption) => db.id === selectedDatabaseId)
          if (found) setSelectedDb(found)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When database selection changes, build analysis
  const handleDatabaseChange = (dbId: string) => {
    const db = databases.find((d) => d.id === dbId)
    if (!db) return
    setSelectedDb(db)
    setDateColumnKey("")

    // Map database columns to reconciliation column types
    const columns: DetectedColumn[] = db.schema.columns
      .sort((a, b) => a.order - b.order)
      .map((col) => ({
        key: col.key,
        label: col.label,
        sampleValues: [],
        suggestedType: mapDatabaseColumnType(col.dataType),
      }))

    onAnalyzed({
      databaseId: db.id,
      databaseName: db.name,
      rowCount: db.rowCount,
      columns,
      dateColumnKey: undefined,
      cadence: "monthly",
    })
  }

  // When period column or cadence changes, update analysis
  const handlePeriodChange = (newDateColumnKey: string, newCadence: string) => {
    setDateColumnKey(newDateColumnKey)
    setCadence(newCadence)

    if (!selectedDb) return

    const columns: DetectedColumn[] = selectedDb.schema.columns
      .sort((a, b) => a.order - b.order)
      .map((col) => ({
        key: col.key,
        label: col.label,
        sampleValues: [],
        suggestedType: mapDatabaseColumnType(col.dataType),
      }))

    onAnalyzed({
      databaseId: selectedDb.id,
      databaseName: selectedDb.name,
      rowCount: selectedDb.rowCount,
      columns,
      dateColumnKey: newDateColumnKey || undefined,
      cadence: newCadence,
    })
  }

  // Get date-type columns for the period column picker
  const dateColumns = selectedDb
    ? selectedDb.schema.columns.filter((c) => c.dataType === "date")
    : []

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6">
      <div className="text-center mb-4">
        <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <h3 className="text-sm font-medium text-gray-700">
          Source {side} — {sideLabel}
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">{sideDescription}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin mr-2" /> Loading databases...
        </div>
      ) : databases.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">
          No databases found. Import data first.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Database selector */}
          <div>
            <Label className="text-xs text-gray-500">Database</Label>
            <Select
              value={selectedDb?.id || ""}
              onValueChange={handleDatabaseChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a database..." />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    <span>{db.name}</span>
                    <span className="ml-2 text-[10px] text-gray-400">
                      ({db.rowCount.toLocaleString()} rows)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected database info */}
          {selectedDb && (
            <>
              <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-md p-2">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>
                  {selectedDb.name} — {selectedDb.schema.columns.length} columns,{" "}
                  {selectedDb.rowCount.toLocaleString()} rows
                </span>
              </div>

              {/* Period column selector (for agent automation) */}
              <div>
                <Label className="text-xs text-gray-500">
                  Period Column <span className="text-gray-400">(optional)</span>
                </Label>
                <p className="text-[10px] text-gray-400 mt-0.5 mb-1.5">
                  Select the date column used to filter data by period. Required for AI agent automation.
                </p>
                <Select
                  value={dateColumnKey}
                  onValueChange={(v) => handlePeriodChange(v, cadence)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="None (use all rows)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (use all rows)</SelectItem>
                    {dateColumns.map((col) => (
                      <SelectItem key={col.key} value={col.key}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cadence selector */}
              {dateColumnKey && dateColumnKey !== "__none__" && (
                <div>
                  <Label className="text-xs text-gray-500">Cadence</Label>
                  <Select
                    value={cadence}
                    onValueChange={(v) => handlePeriodChange(dateColumnKey, v)}
                  >
                    <SelectTrigger className="mt-1 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
