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

interface ActionCompleteReportConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

interface ReportDef {
  id: string
  name: string
}

export function ActionCompleteReportConfig({ params, onChange }: ActionCompleteReportConfigProps) {
  const [reports, setReports] = useState<ReportDef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/report-definitions")
      .then((r) => r.ok ? r.json() : { reportDefinitions: [] })
      .then((data) => setReports(data.reportDefinitions || data.definitions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-gray-500">Report Template</Label>
        <Select
          value={(params.reportDefinitionId as string) || ""}
          onValueChange={(value) => onChange({ ...params, reportDefinitionId: value })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select a report template"} />
          </SelectTrigger>
          <SelectContent>
            {reports.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-gray-400 mt-1">
          The report will be generated for the current period automatically.
        </p>
      </div>
    </div>
  )
}
