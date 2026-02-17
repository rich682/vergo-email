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

interface RequestTemplate {
  id: string
  name: string
  subjectTemplate: string
}

interface RequestTemplatePickerProps {
  value: string | undefined
  onChange: (templateId: string) => void
}

export function RequestTemplatePicker({ value, onChange }: RequestTemplatePickerProps) {
  const [templates, setTemplates] = useState<RequestTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/request-templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selected = templates.find((t) => t.id === value)

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">Request Template</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder={loading ? "Loading..." : "Select a request template"} />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <p className="text-[11px] text-gray-400 mt-1 truncate">
          Subject: {selected.subjectTemplate}
        </p>
      )}
    </div>
  )
}
