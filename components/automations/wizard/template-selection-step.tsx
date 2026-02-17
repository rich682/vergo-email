"use client"

import {
  Send, ClipboardList, Scale, FileBarChart, Clock, Bot, Wrench,
  AlertCircle, DollarSign, FileCheck, ShieldCheck, Workflow,
} from "lucide-react"
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates"
import { TriggerBadge } from "../shared/trigger-description"
import type { AutomationTemplate } from "@/lib/automations/types"

const ICON_MAP: Record<string, typeof Send> = {
  Send, ClipboardList, Scale, FileBarChart, Clock, Bot, Wrench,
  AlertCircle, DollarSign, FileCheck, ShieldCheck, Workflow,
}

// ── Template grouping ─────────────────────────────────────────────────
interface TemplateGroup {
  label: string
  description: string
  templateIds: string[]
}

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    label: "Data Collection",
    description: "Automate sending requests and forms to contacts",
    templateIds: ["send-requests-new-period", "send-forms-new-period", "monthly-scheduled-request"],
  },
  {
    label: "Overdue & Follow-ups",
    description: "Chase outstanding invoices and balances automatically",
    templateIds: ["chase-overdue-invoices", "outstanding-balance-follow-up"],
  },
  {
    label: "Compliance & Documents",
    description: "Collect W-9s, COIs, and other vendor documents",
    templateIds: ["collect-w9-new-vendors", "annual-coi-renewal"],
  },
  {
    label: "Reconciliation",
    description: "Match and reconcile data across sources",
    templateIds: ["auto-reconcile-data-uploaded", "reconcile-and-report"],
  },
  {
    label: "Reports & Analysis",
    description: "Generate reports when boards complete",
    templateIds: ["report-on-board-complete"],
  },
  {
    label: "AI Agent Workflows",
    description: "Run AI agents on schedules or triggered by events",
    templateIds: ["scheduled-agent-run", "agent-on-form-submission"],
  },
  {
    label: "Multi-step Workflows",
    description: "End-to-end processes combining multiple actions",
    templateIds: ["full-period-close"],
  },
]

// ── Component ─────────────────────────────────────────────────────────

interface TemplateSelectionStepProps {
  selectedId: string | null
  onSelect: (template: AutomationTemplate) => void
}

export function TemplateSelectionStep({ selectedId, onSelect }: TemplateSelectionStepProps) {
  const templateMap = new Map(AUTOMATION_TEMPLATES.map((t) => [t.id, t]))
  const customTemplate = templateMap.get("custom")

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Choose a template</h2>
      <p className="text-sm text-gray-500 mb-6">
        Start with a pre-built automation or build your own from scratch.
      </p>

      <div className="space-y-6">
        {TEMPLATE_GROUPS.map((group) => {
          const templates = group.templateIds
            .map((id) => templateMap.get(id))
            .filter(Boolean) as AutomationTemplate[]

          if (templates.length === 0) return null

          return (
            <div key={group.label}>
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.label}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={selectedId === template.id}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* Custom — always at the bottom, separated */}
        {customTemplate && (
          <div>
            <div className="mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Custom
              </h3>
            </div>
            <TemplateCard
              template={customTemplate}
              isSelected={selectedId === "custom"}
              onSelect={onSelect}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: AutomationTemplate
  isSelected: boolean
  onSelect: (template: AutomationTemplate) => void
}) {
  const Icon = ICON_MAP[template.icon] || Wrench

  return (
    <button
      type="button"
      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
        isSelected
          ? "border-orange-500 bg-orange-50/50"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
      onClick={() => onSelect(template)}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isSelected ? "bg-orange-100" : "bg-gray-100"
        }`}>
          <Icon className={`w-5 h-5 ${isSelected ? "text-orange-600" : "text-gray-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900">{template.name}</h3>
            {template.id !== "custom" && (
              <TriggerBadge trigger={template.triggerType} />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          {template.defaultSteps.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {template.defaultSteps.map((step, i) => (
                <span key={i} className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                  {step.label || step.actionType || step.type}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
