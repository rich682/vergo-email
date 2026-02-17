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
import { RequestTemplatePicker } from "./send-request/request-template-picker"
import { RecipientSourceConfig } from "./send-request/recipient-source-config"
import { ScheduleConfig } from "./send-request/schedule-config"

interface ActionSendRequestConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

interface Quest {
  id: string
  name: string
}

/**
 * Send Request step configuration.
 *
 * Supports two modes:
 * - Legacy: picks a pre-existing Quest (questId)
 * - V2: picks a RequestTemplate + configures recipients + optional schedule
 *
 * Legacy mode is shown when the step already has a questId (existing automations).
 * New configurations default to V2 mode.
 */
export function ActionSendRequestConfig({ params, onChange }: ActionSendRequestConfigProps) {
  const isLegacy = !!params.questId && !params.requestTemplateId

  if (isLegacy) {
    return <LegacyQuestConfig params={params} onChange={onChange} />
  }

  return (
    <div className="space-y-5">
      {/* Section A: Email Content */}
      <div>
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Email Content
        </div>
        <RequestTemplatePicker
          value={params.requestTemplateId as string | undefined}
          onChange={(templateId) => onChange({ ...params, requestTemplateId: templateId })}
        />
      </div>

      {/* Section B: Recipients */}
      <div>
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Recipients
        </div>
        <RecipientSourceConfig params={params} onChange={onChange} />
      </div>

      {/* Section C: Schedule & Reminders */}
      <ScheduleConfig params={params} onChange={onChange} />
    </div>
  )
}

/** Legacy configuration for existing automations that use questId */
function LegacyQuestConfig({
  params,
  onChange,
}: {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/quests")
      .then((r) => (r.ok ? r.json() : { quests: [] }))
      .then((data) => setQuests(data.quests || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const migrateToV2 = () => {
    // Remove questId and switch to v2 mode
    const { questId, ...rest } = params
    onChange(rest)
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-gray-500">Request Template (legacy)</Label>
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
          This step uses a legacy quest configuration. Recipients and content are bundled together.
        </p>
      </div>
      <button
        type="button"
        onClick={migrateToV2}
        className="text-xs text-orange-600 hover:text-orange-700 underline"
      >
        Switch to new format (separate template + recipients)
      </button>
    </div>
  )
}
