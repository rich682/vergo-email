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

interface ActionSendRequestConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

interface Quest {
  id: string
  name: string
}

export function ActionSendRequestConfig({ params, onChange }: ActionSendRequestConfigProps) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/quests")
      .then((r) => r.ok ? r.json() : { quests: [] })
      .then((data) => setQuests(data.quests || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-gray-500">Request Template</Label>
        <Select
          value={(params.questId as string) || ""}
          onValueChange={(value) => onChange({ ...params, questId: value })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select a request template"} />
          </SelectTrigger>
          <SelectContent>
            {quests.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-gray-400 mt-1">
          The saved request template to send when this step runs.
        </p>
      </div>
    </div>
  )
}
