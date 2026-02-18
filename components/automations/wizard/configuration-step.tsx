"use client"

import { useEffect, useState } from "react"
import { Info, Loader2 } from "lucide-react"
import { RequestTemplatePicker } from "../steps/send-request/request-template-picker"
import { DatabaseRecipientConfig } from "../steps/send-request/database-recipient-config"

interface ConfigurationStepProps {
  templateId: string
  selectedTaskId: string | null
  configuration: Record<string, unknown>
  onConfigurationChange: (config: Record<string, unknown>) => void
}

export function ConfigurationStep({
  templateId,
  selectedTaskId,
  configuration,
  onConfigurationChange,
}: ConfigurationStepProps) {
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Auto-fetch config from task when component mounts (if not already loaded)
  useEffect(() => {
    if (selectedTaskId && !loaded) {
      setLoading(true)
      fetch(`/api/task-instances/${selectedTaskId}/config`)
        .then((res) => (res.ok ? res.json() : { config: {} }))
        .then((data) => {
          if (data.config && Object.keys(data.config).length > 0) {
            onConfigurationChange({ ...configuration, ...data.config })
          }
          setLoaded(true)
        })
        .catch(() => setLoaded(true))
        .finally(() => setLoading(false))
    }
  }, [selectedTaskId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading configuration from task...
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Configure automation</h2>
      <p className="text-sm text-gray-500 mb-6">
        Review and adjust the configuration pulled from your task history.
      </p>

      {templateId === "send-standard-request" && (
        <SendStandardRequestConfig
          configuration={configuration}
          onChange={onConfigurationChange}
        />
      )}

      {templateId === "send-form" && (
        <SendFormConfig
          configuration={configuration}
          onChange={onConfigurationChange}
        />
      )}

      {templateId === "send-data-request" && (
        <SendDataRequestConfig
          configuration={configuration}
          onChange={onConfigurationChange}
        />
      )}

      {templateId === "run-reconciliation" && (
        <ReconciliationConfig configuration={configuration} />
      )}

      {templateId === "run-report" && (
        <ReportConfig configuration={configuration} />
      )}
    </div>
  )
}

// ─── Template-Specific Configurations ─────────────────────────────────────────

function SendStandardRequestConfig({
  configuration,
  onChange,
}: {
  configuration: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-5">
      {/* Email Content — inherited from task */}
      <div>
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Email Content
        </div>
        {configuration.subjectTemplate ? (
          <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <span>
                Email content is inherited from the linked task. The agent will use
                the same email template as previous periods.
              </span>
              <p className="mt-1.5 text-gray-500 truncate">
                Subject: {String(configuration.subjectTemplate)}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <span>
              No email template found on the linked task. Please ensure the task has
              sent at least one request so the agent can inherit its email content.
            </span>
          </div>
        )}
      </div>

      {/* Recipients — read-only info */}
      <div>
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Recipients
        </div>
        <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
          <span>
            Recipients are inherited from the linked task. The agent will send to
            the same contacts as previous periods.
          </span>
        </div>
      </div>
    </div>
  )
}

function SendFormConfig({
  configuration,
}: {
  configuration: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-5">
      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
        <span>
          The agent will send the same form template used in the linked task to the
          same recipients from previous periods.
        </span>
      </div>
    </div>
  )
}

function SendDataRequestConfig({
  configuration,
  onChange,
}: {
  configuration: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-5">
      {/* Email Template — inherited from task */}
      <div>
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Email Content
        </div>
        <RequestTemplatePicker
          value={configuration.requestTemplateId as string | undefined}
          onChange={(id) => onChange({ ...configuration, requestTemplateId: id })}
        />
      </div>

      {/* Recipients — from database */}
      <div>
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Recipients (from database)
        </div>
        <div className="text-xs text-gray-600 bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2 mb-3">
          <Info className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span>
            Recipients are resolved from a database each period. Select the database
            and map the email column. Filters determine which rows receive the email.
          </span>
        </div>
        <DatabaseRecipientConfig params={configuration} onChange={onChange} />
      </div>

    </div>
  )
}

function ReconciliationConfig({
  configuration,
}: {
  configuration: Record<string, unknown>
}) {
  const configName = configuration.reconciliationConfigName as string | undefined
  const [configSourceType, setConfigSourceType] = useState<string | null>(null)
  const [checkingConfig, setCheckingConfig] = useState(false)
  const reconciliationConfigId = configuration.reconciliationConfigId as string | undefined

  // Check if the linked reconciliation config is database_database
  useEffect(() => {
    if (reconciliationConfigId) {
      setCheckingConfig(true)
      fetch(`/api/reconciliations/${reconciliationConfigId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.config?.sourceType) {
            setConfigSourceType(data.config.sourceType)
          }
        })
        .catch(() => {})
        .finally(() => setCheckingConfig(false))
    }
  }, [reconciliationConfigId])

  const isDatabaseDatabase = configSourceType === "database_database"
  const isNotDatabaseDatabase = configSourceType && configSourceType !== "database_database"

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <span>
            This automation uses the reconciliation configuration from the linked task.
            The workflow loads data from both databases, runs AI matching, then waits for review.
          </span>
          {configName && (
            <p className="mt-1.5 font-medium text-gray-700">
              Configuration: {configName}
            </p>
          )}
        </div>
      </div>

      {/* Warning if config is not database_database */}
      {checkingConfig ? (
        <div className="text-xs text-gray-500 flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking reconciliation configuration...
        </div>
      ) : isNotDatabaseDatabase ? (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Incompatible configuration.</span>{" "}
            Automated reconciliation requires a <strong>Database vs Database</strong> configuration.
            The linked task uses document uploads which cannot be automated.
            Please update the reconciliation to use database sources in the{" "}
            <a href="/dashboard/reconciliations" className="underline">Reconciliation Builder</a>.
          </div>
        </div>
      ) : isDatabaseDatabase ? (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span>
            Database vs Database configuration detected. The agent will automatically load
            data from both databases and run matching each period.
          </span>
        </div>
      ) : null}

      {/* Fixed workflow preview */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Workflow Steps
        </div>
        <div className="space-y-1.5">
          {[
            { num: 1, label: "Load data & run AI matching" },
            { num: 2, label: "Review reconciliation results" },
            { num: 3, label: "Complete reconciliation" },
          ].map((step) => (
            <div key={step.num} className="flex items-center gap-3 py-1.5 px-3 bg-gray-50 rounded-md">
              <span className="text-xs text-gray-400 w-4 text-center font-medium">{step.num}</span>
              <span className="text-sm text-gray-700">{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReportConfig({
  configuration,
}: {
  configuration: Record<string, unknown>
}) {
  const reportName = configuration.reportDefinitionName as string | undefined

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <span>
            {reportName
              ? `This agent will re-generate "${reportName}" for each new period. When the underlying data is updated, the agent produces a fresh report snapshot.`
              : "This automation uses the report configuration from the linked task. It will generate the report automatically for each new period."}
          </span>
        </div>
      </div>
    </div>
  )
}
