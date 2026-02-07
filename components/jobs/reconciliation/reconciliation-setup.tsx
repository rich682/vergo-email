"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, ArrowRight } from "lucide-react"

interface ColumnConfig {
  key: string
  label: string
  type: "date" | "amount" | "text" | "reference"
}

interface ReconciliationSetupProps {
  taskInstanceId: string
  taskName: string
  onCreated: (configId: string) => void
}

export function ReconciliationSetup({ taskInstanceId, taskName, onCreated }: ReconciliationSetupProps) {
  const [name, setName] = useState(`${taskName} Reconciliation`)
  const [sourceALabel, setSourceALabel] = useState("Bank Statement")
  const [sourceBLabel, setSourceBLabel] = useState("General Ledger")
  const [sourceACols, setSourceACols] = useState<ColumnConfig[]>([
    { key: "date", label: "Date", type: "date" },
    { key: "description", label: "Description", type: "text" },
    { key: "amount", label: "Amount", type: "amount" },
    { key: "reference", label: "Reference", type: "reference" },
  ])
  const [sourceBCols, setSourceBCols] = useState<ColumnConfig[]>([
    { key: "date", label: "Date", type: "date" },
    { key: "description", label: "Description", type: "text" },
    { key: "amount", label: "Amount", type: "amount" },
    { key: "reference", label: "Reference", type: "reference" },
  ])
  const [amountMatch, setAmountMatch] = useState<"exact" | "tolerance">("exact")
  const [amountTolerance, setAmountTolerance] = useState(0)
  const [dateWindowDays, setDateWindowDays] = useState(3)
  const [fuzzyDescription, setFuzzyDescription] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const addColumn = (side: "A" | "B") => {
    const newCol: ColumnConfig = { key: `col_${Date.now()}`, label: "", type: "text" }
    if (side === "A") setSourceACols([...sourceACols, newCol])
    else setSourceBCols([...sourceBCols, newCol])
  }

  const removeColumn = (side: "A" | "B", index: number) => {
    if (side === "A") setSourceACols(sourceACols.filter((_, i) => i !== index))
    else setSourceBCols(sourceBCols.filter((_, i) => i !== index))
  }

  const updateColumn = (side: "A" | "B", index: number, field: keyof ColumnConfig, value: string) => {
    const setter = side === "A" ? setSourceACols : setSourceBCols
    const cols = side === "A" ? [...sourceACols] : [...sourceBCols]
    cols[index] = { ...cols[index], [field]: value }
    if (field === "label") {
      cols[index].key = value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    }
    setter(cols)
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return }
    setCreating(true)
    setError("")

    try {
      const res = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskInstanceId,
          name,
          sourceAConfig: { label: sourceALabel, columns: sourceACols },
          sourceBConfig: { label: sourceBLabel, columns: sourceBCols },
          matchingRules: {
            amountMatch,
            amountTolerance: amountMatch === "tolerance" ? amountTolerance : 0,
            dateWindowDays,
            fuzzyDescription,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create reconciliation")
      }

      const { config } = await res.json()
      onCreated(config.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const ColumnEditor = ({ side, columns }: { side: "A" | "B"; columns: ColumnConfig[] }) => (
    <div className="space-y-2">
      {columns.map((col, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={col.label}
            onChange={(e) => updateColumn(side, i, "label", e.target.value)}
            placeholder="Column name"
            className="flex-1 h-8 text-sm"
          />
          <Select value={col.type} onValueChange={(v) => updateColumn(side, i, "type", v)}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="amount">Amount</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="reference">Reference</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={() => removeColumn(side, i)} className="p-1 text-gray-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={() => addColumn(side)} className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 mt-1">
        <Plus className="w-3 h-3" /> Add column
      </button>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Set Up Reconciliation</h3>
        <p className="text-sm text-gray-500">
          Configure the sources and matching rules for this reconciliation. This is a one-time setup
          that applies to all future runs.
        </p>
      </div>

      {/* Name */}
      <div>
        <Label className="text-sm font-medium text-gray-700">Reconciliation Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Chase Checking Bank Rec" />
      </div>

      {/* Sources */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Label className="text-sm font-medium text-gray-700">Source A</Label>
          <Input
            value={sourceALabel}
            onChange={(e) => setSourceALabel(e.target.value)}
            className="mt-1 mb-3"
            placeholder="e.g. Bank Statement"
          />
          <p className="text-xs text-gray-500 mb-2">Expected columns:</p>
          <ColumnEditor side="A" columns={sourceACols} />
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700">Source B</Label>
          <Input
            value={sourceBLabel}
            onChange={(e) => setSourceBLabel(e.target.value)}
            className="mt-1 mb-3"
            placeholder="e.g. General Ledger"
          />
          <p className="text-xs text-gray-500 mb-2">Expected columns:</p>
          <ColumnEditor side="B" columns={sourceBCols} />
        </div>
      </div>

      {/* Matching Rules */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Matching Rules</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Amount Matching</Label>
            <Select value={amountMatch} onValueChange={(v: "exact" | "tolerance") => setAmountMatch(v)}>
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">Exact Match</SelectItem>
                <SelectItem value="tolerance">Tolerance</SelectItem>
              </SelectContent>
            </Select>
            {amountMatch === "tolerance" && (
              <Input
                type="number"
                step="0.01"
                value={amountTolerance}
                onChange={(e) => setAmountTolerance(Number(e.target.value))}
                className="mt-2 h-8 text-sm"
                placeholder="$ tolerance"
              />
            )}
          </div>

          <div>
            <Label className="text-xs text-gray-500">Date Window</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                value={dateWindowDays}
                onChange={(e) => setDateWindowDays(Number(e.target.value))}
                className="h-8 text-sm w-20"
              />
              <span className="text-xs text-gray-500">days</span>
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500">AI Fuzzy Matching</Label>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setFuzzyDescription(!fuzzyDescription)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fuzzyDescription ? "bg-orange-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${fuzzyDescription ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="text-xs text-gray-600">{fuzzyDescription ? "Enabled" : "Disabled"}</span>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={creating} className="bg-orange-500 hover:bg-orange-600 text-white">
          {creating ? "Creating..." : "Create Reconciliation"}
          {!creating && <ArrowRight className="w-4 h-4 ml-2" />}
        </Button>
      </div>
    </div>
  )
}
