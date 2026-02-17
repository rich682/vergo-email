"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DatabaseCondition {
  databaseId: string
  columnKey: string
  operator: string
  value: unknown
  boardScope?: string
}

interface DatabaseOption {
  id: string
  name: string
}

interface ColumnOption {
  key: string
  label: string
  dataType: string
}

interface DatabaseConditionBuilderProps {
  condition: DatabaseCondition
  onChange: (condition: DatabaseCondition) => void
}

const OPERATOR_OPTIONS = [
  { value: "eq", label: "Equals" },
  { value: "between", label: "Between" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
  { value: "gte", label: "Greater than or equal" },
  { value: "lte", label: "Less than or equal" },
  { value: "contains", label: "Contains" },
]

export function DatabaseConditionBuilder({ condition, onChange }: DatabaseConditionBuilderProps) {
  const [databases, setDatabases] = useState<DatabaseOption[]>([])
  const [columns, setColumns] = useState<ColumnOption[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [loadingCols, setLoadingCols] = useState(false)

  // Fetch databases on mount
  useEffect(() => {
    setLoadingDbs(true)
    fetch("/api/databases")
      .then((r) => r.json())
      .then((data) => {
        const dbs = (data.databases || []).map((db: any) => ({
          id: db.id,
          name: db.name,
        }))
        setDatabases(dbs)
      })
      .catch(() => {})
      .finally(() => setLoadingDbs(false))
  }, [])

  // Fetch columns when database changes
  useEffect(() => {
    if (!condition.databaseId) {
      setColumns([])
      return
    }
    setLoadingCols(true)
    fetch(`/api/databases/${condition.databaseId}`)
      .then((r) => r.json())
      .then((data) => {
        const schema = data.database?.schema
        if (schema?.columns) {
          setColumns(
            schema.columns.map((col: any) => ({
              key: col.key,
              label: col.label,
              dataType: col.dataType,
            }))
          )
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCols(false))
  }, [condition.databaseId])

  const useBoardScope = condition.boardScope === "current_period"

  return (
    <div className="space-y-3">
      {/* Database selector */}
      <div>
        <Label className="text-xs text-gray-500">Database</Label>
        {loadingDbs ? (
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading databases...
          </div>
        ) : (
          <Select
            value={condition.databaseId}
            onValueChange={(v) =>
              onChange({ ...condition, databaseId: v, columnKey: "" })
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a database..." />
            </SelectTrigger>
            <SelectContent>
              {databases.map((db) => (
                <SelectItem key={db.id} value={db.id}>
                  {db.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Column selector */}
      {condition.databaseId && (
        <div>
          <Label className="text-xs text-gray-500">Column</Label>
          {loadingCols ? (
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading columns...
            </div>
          ) : (
            <Select
              value={condition.columnKey}
              onValueChange={(v) => onChange({ ...condition, columnKey: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a column..." />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    <span>{col.label}</span>
                    <span className="ml-2 text-[10px] text-gray-400">
                      ({col.dataType})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Operator */}
      {condition.columnKey && (
        <div>
          <Label className="text-xs text-gray-500">Condition</Label>
          <Select
            value={condition.operator || "eq"}
            onValueChange={(v) => onChange({ ...condition, operator: v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATOR_OPTIONS.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Value input */}
      {condition.columnKey && condition.operator && !useBoardScope && (
        <div>
          <Label className="text-xs text-gray-500">Value</Label>
          {condition.operator === "between" ? (
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="From"
                value={
                  Array.isArray(condition.value)
                    ? String(condition.value[0] || "")
                    : ""
                }
                onChange={(e) =>
                  onChange({
                    ...condition,
                    value: [
                      e.target.value,
                      Array.isArray(condition.value)
                        ? condition.value[1] || ""
                        : "",
                    ],
                  })
                }
              />
              <Input
                placeholder="To"
                value={
                  Array.isArray(condition.value)
                    ? String(condition.value[1] || "")
                    : ""
                }
                onChange={(e) =>
                  onChange({
                    ...condition,
                    value: [
                      Array.isArray(condition.value)
                        ? condition.value[0] || ""
                        : "",
                      e.target.value,
                    ],
                  })
                }
              />
            </div>
          ) : (
            <Input
              className="mt-1"
              placeholder="e.g. February, 2026-02-01"
              value={typeof condition.value === "string" ? condition.value : ""}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
            />
          )}
        </div>
      )}

      {/* Board scope toggle */}
      {condition.columnKey && (
        <label className="flex items-center gap-2.5 cursor-pointer mt-2">
          <input
            type="checkbox"
            checked={useBoardScope}
            onChange={(e) => {
              if (e.target.checked) {
                // Auto-set between operator with template vars for board scope
                onChange({
                  ...condition,
                  boardScope: "current_period",
                  operator: "between",
                  value: ["{{board.periodStart}}", "{{board.periodEnd}}"],
                })
              } else {
                onChange({
                  ...condition,
                  boardScope: undefined,
                  value: "",
                })
              }
            }}
            className="rounded accent-orange-500"
          />
          <div>
            <span className="text-xs text-gray-700">
              Use current board period
            </span>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Automatically matches data for the active board&apos;s date range
            </p>
          </div>
        </label>
      )}
    </div>
  )
}
