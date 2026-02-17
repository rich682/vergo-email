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

interface ActionSendFormConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

interface FormDef {
  id: string
  name: string
}

export function ActionSendFormConfig({ params, onChange }: ActionSendFormConfigProps) {
  const [forms, setForms] = useState<FormDef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/form-definitions")
      .then((r) => r.ok ? r.json() : { formDefinitions: [] })
      .then((data) => setForms(data.formDefinitions || data.forms || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-gray-500">Form Template</Label>
        <Select
          value={(params.formDefinitionId as string) || ""}
          onValueChange={(value) => onChange({ ...params, formDefinitionId: value })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select a form template"} />
          </SelectTrigger>
          <SelectContent>
            {forms.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-gray-400 mt-1">
          The form to send to recipients when this step runs.
        </p>
      </div>
    </div>
  )
}
