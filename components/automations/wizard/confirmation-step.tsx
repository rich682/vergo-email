"use client"

import { Badge } from "@/components/ui/badge"
import { TriggerIcon, TriggerDescriptionText } from "../shared/trigger-description"
import type { TriggerType } from "@/lib/workflows/types"

interface ConfirmationStepProps {
  name: string
  linkedTaskName: string | null
  linkedTaskType: string | null
  triggerType: TriggerType
  conditions: Record<string, unknown>
  configuration: Record<string, unknown>
  templateId: string
}

const TYPE_LABELS: Record<string, string> = {
  request: "Request",
  form: "Form",
  reconciliation: "Reconciliation",
  report: "Report",
}

export function ConfirmationStep({
  name,
  linkedTaskName,
  linkedTaskType,
  triggerType,
  conditions,
  configuration,
  templateId,
}: ConfirmationStepProps) {
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Review &amp; create</h2>
      <p className="text-sm text-gray-500 mb-6">
        Confirm your automation details before creating.
      </p>

      <div className="space-y-4">
        {/* Name */}
        <ReviewSection label="Name">
          <p className="text-sm text-gray-900 font-medium">{name || "Untitled Agent"}</p>
        </ReviewSection>

        {/* Linked Task */}
        <ReviewSection label="Linked Task">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-900">{linkedTaskName || "None"}</span>
            {linkedTaskType && (
              <Badge variant="outline" className="text-[10px]">
                {TYPE_LABELS[linkedTaskType] || linkedTaskType}
              </Badge>
            )}
          </div>
        </ReviewSection>

        {/* Trigger */}
        <ReviewSection label="Trigger">
          <div className="flex items-center gap-2">
            <TriggerIcon trigger={triggerType} size="sm" />
            <TriggerDescriptionText
              trigger={triggerType}
              conditions={conditions}
              className="text-sm text-gray-700"
            />
          </div>
        </ReviewSection>

        {/* Configuration Summary */}
        <ReviewSection label="Configuration">
          <ConfigSummary templateId={templateId} configuration={configuration} />
        </ReviewSection>
      </div>
    </div>
  )
}

function ConfigSummary({
  templateId,
  configuration,
}: {
  templateId: string
  configuration: Record<string, unknown>
}) {
  if (templateId === "send-standard-request") {
    return (
      <div className="space-y-1.5 text-sm text-gray-700">
        {!!configuration.requestTemplateId && (
          <p>Request template configured</p>
        )}
        <p>Recipients: From task history</p>
        {!!(configuration.remindersConfig as { enabled?: boolean })?.enabled && (
          <p>Reminders: Enabled ({(configuration.remindersConfig as { frequency?: string })?.frequency || "weekly"})</p>
        )}
        {!!configuration.deadlineDate && (
          <p>Deadline: Configured</p>
        )}
      </div>
    )
  }

  if (templateId === "send-form") {
    return (
      <div className="space-y-1.5 text-sm text-gray-700">
        <p>Form template from linked task</p>
        <p>Recipients: From task history</p>
      </div>
    )
  }

  if (templateId === "send-data-request") {
    return (
      <div className="space-y-1.5 text-sm text-gray-700">
        {!!configuration.requestTemplateId && (
          <p>Email template configured</p>
        )}
        <p>Recipients: From database</p>
        {!!configuration.databaseId && (
          <p className="text-xs text-gray-400">Database configured</p>
        )}
        {!!(configuration.remindersConfig as { enabled?: boolean })?.enabled && (
          <p>Reminders: Enabled ({(configuration.remindersConfig as { frequency?: string })?.frequency || "weekly"})</p>
        )}
      </div>
    )
  }

  if (templateId === "run-reconciliation") {
    return (
      <div className="space-y-1.5 text-sm text-gray-700">
        <p>3-step workflow: AI matching &rarr; Review &rarr; Complete</p>
        {!!configuration.reconciliationConfigId && (
          <p className="text-xs text-gray-400">Config: {String(configuration.reconciliationConfigId).slice(0, 8)}...</p>
        )}
      </div>
    )
  }

  if (templateId === "run-report") {
    return (
      <div className="space-y-1.5 text-sm text-gray-700">
        <p>Auto-generate report for each period</p>
        {!!configuration.reportDefinitionId && (
          <p className="text-xs text-gray-400">Definition: {String(configuration.reportDefinitionId).slice(0, 8)}...</p>
        )}
      </div>
    )
  }

  return <p className="text-sm text-gray-400">No configuration</p>
}

function ReviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</h3>
      {children}
    </div>
  )
}
